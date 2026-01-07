'use server';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { logger } from '@/lib/logger';
import { adminFirestore, adminStorage, bucket, GCSFile } from '@/config/firebase-admin';
import { MAX_AUDIO_SIZE } from '@/lib/schemas/media';
import { headers } from 'next/headers';
import { AudioPool } from '@/lib/httpsAgent';
import { generateHMACSignature } from '@/lib/hmac';
import {
  audioExtractSchema,
  audioJobStatusSchema,
  audioConfig,
  SIGNED_URL_EXPIRES_IN_MS,
  audioExtract,
  audioJobStatus,
  audioUploadSchema,
  audioUploadOutput,
  audioUpload,
  MAX_TOTAL_CHUNKS,
  AUDIO_MIME_TYPE_TO_EXTENSIONS,
  videoSourceUploadSchema,
  videoSourceUpload
} from '@/actions/schemas/file';

const CONTENT_CACHE_COLLECTION = 'content-cache';

type ChunkUploadPolicyInput = {
  userId: string;
  sessionId: string;

  chunkIndex: number;
  totalChunks: number;

  fileType: string; // mime type
  extension: string;
};

function buildChunkUploadPolicy(input: ChunkUploadPolicyInput) {
  const {
    userId,
    sessionId,
    chunkIndex,
    totalChunks,
    fileType,
    extension,
  } = input;

  const fileName = `chunk_${String(chunkIndex).padStart(2, '0')}.${extension}`;
  const filePath = `${audioConfig.storagePath}/${userId}/${sessionId}/${fileName}`;

  const conditions = [
    ['content-length-range', 0, audioConfig.maxSizeBytes],
    ['eq', '$key', filePath],
    ['eq', '$Content-Type', fileType],
    ['eq', '$x-goog-meta-chunk-index', chunkIndex.toString()],
    ['eq', '$x-goog-meta-total-chunks', totalChunks.toString()],
    ['eq', '$x-goog-meta-batch-session-id', sessionId]
  ];

  const fields: Record<string, string> = {
    "Content-Type": fileType,
    "x-goog-meta-chunk-index": chunkIndex.toString(),
    "x-goog-meta-total-chunks": totalChunks.toString(),
    "x-goog-meta-batch-session-id": sessionId,
  };

  return { conditions, fields };
}

export async function generateUploadSignedUrlForAudio(
  payload: audioUpload,
  userId: string,
): Promise<audioUploadOutput> {
  const validatedPayload = audioUploadSchema.parse(payload);
  const { fileType, totalChunks, chunkSizes } = validatedPayload;

  try {
    const sessionId = crypto.randomUUID();
    const expirationTime = Date.now() + SIGNED_URL_EXPIRES_IN_MS;
    const extension = AUDIO_MIME_TYPE_TO_EXTENSIONS[fileType];
    
    const limit = pLimit(10);

    const uploads = await Promise.all(
      chunkSizes.map((_, index) =>
        limit(async () => {
          const fileName = `chunk_${String(index).padStart(2, '0')}.${extension}`;
          const filePath = `${audioConfig.storagePath}/${userId}/${sessionId}/${fileName}`;

          const { conditions, fields } = buildChunkUploadPolicy({
            userId,
            sessionId,
            chunkIndex: index,
            totalChunks,
            fileType,
            extension,
          });

          const [signedUrl] = await bucket.file(filePath).generateSignedPostPolicyV4({
            expires: expirationTime,
            conditions,
            fields,
          });

          return { chunkIndex: index, fileName, signedUrl };
        })
      )
    );

    return { success: true, sessionId, uploads };
  } catch (error) {
    await logger('Error in generateUploadSignedUrlForAudio: ', error);
    return {
      success: false,
      message: "Signed URL 생성에 실패했습니다."
    };
  }
}

export async function transcribeAudioBatch(
  payload: audioExtract,
  userId: string,
): Promise<{
  success: boolean;
  jobId?: string;
  status?: string;
  message?: string;
}> {
  const validatedPayload = audioExtractSchema.parse(payload);
  const { sessionId, transcriptionPrompt } = validatedPayload;

  const bucket = adminStorage.bucket();

  const prefix = `${audioConfig.storagePath}/${userId}/${sessionId}`;

  try {
    const [files] = await bucket.getFiles({ prefix });

    if (files.length === 0) {
      return {
        success: false,
        message: "업로드된 오디오를 찾을 수 없습니다. 다시 업로드해주세요."
      };
    }

    const firstFileMeta = files[0].metadata?.metadata; 
    const isSourceMode = firstFileMeta?.['is-source'] === 'true';

    if (isSourceMode) {
      await validateSourceVideo(files);
    } else {
      await validateFiles(files);
    }

    const headersList = await headers();
    const clientIp = headersList.get('x-forwarded-for')?.split(',')[0] || 'IP_NOT_FOUND';
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const secret = process.env.API_SECRET_KEY;
    if (!secret) {
      throw new Error('API Secret Key is not configured');
    }

    const reqbody = JSON.stringify({
      sessionId,
      userId,
      ...(transcriptionPrompt && { transcriptionPrompt })
    });

    const signature = generateHMACSignature(
      secret,
      'POST',
      '/v1/transcription',
      reqbody,
      timestamp,
      nonce
    );

    const { statusCode, body } = await AudioPool.request({
      method: 'POST',
      path: '/api/v1/transcription',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'User-Agent': 'QuizGenApp/1.0',
        'X-Forwarded-For': clientIp,
      },
      body: reqbody,
    });

    if (statusCode < 200 || statusCode >= 300) {
      await body.dump();
      throw new Error(`배치 API 요청 실패: ${statusCode}`);
    }

    const result = await body.json() as { jobId: string };

    return { success: true, jobId: result.jobId, status: 'pending' };
  } catch (error) {
    await logger("오디오 변환 실패: ", error);
    return {
      success: false,
      message: "오디오를 텍스트로 변환하는 데 실패했습니다."
    };
  }
}

export async function getTranscriptionResult(
  payload: audioJobStatus,
  userId: string,
): Promise<{
  success: boolean;
  status: string;
  transcript?: string;
  cacheKey?: string;
  message?: string;
}> {
  const { jobId } = audioJobStatusSchema.parse(payload);

  try {
    const jobDoc = await adminFirestore.collection('transcribe-audio').doc(jobId).get();
    if (!jobDoc.exists) {
      return { success: true, status: 'pending' };
    }

    const jobData = jobDoc.data() || {};
    if (jobData.userId && jobData.userId !== userId) {
      return { success: false, status: 'unauthorized', message: 'Not authorized to access this job.' };
    }

    const status = typeof jobData.status === 'string' ? jobData.status : 'pending';

    if (status === 'done') {
      const cacheDoc = await adminFirestore.collection(CONTENT_CACHE_COLLECTION).doc(jobId).get();
      const data = cacheDoc.data() || {};

      const snippet = data.snippet;
      return { success: true, status, transcript: snippet, cacheKey: jobId };
    }

    if (status === 'failed') {
      return {
        success: false,
        status,
        message: '오디오를 텍스트로 변환하는 데 실패했습니다.',
      };
    }

    return { success: true, status };
  } catch (error) {
    await logger('Error fetching transcription job result: ', error);
    return { success: false, status: 'error', message: 'Failed to fetch transcription job result.' };
  }
}

async function validateFiles(audios: GCSFile[]) {
  const metadataPromises = audios.map(audio => audio.metadata);
  const allMetadata = await Promise.all(metadataPromises);

  const allowedTypes = new Set(audioConfig.mimeType);

  for (const meta of allMetadata) {
    const sizeNum = Number(meta?.size);
    const contentType = meta?.contentType;
    const custom = meta?.metadata as Record<string, string> | undefined;

    const label = meta.name ?? "(unknown-file)";

    if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
      throw new Error(`파일 ${label}: size 메타데이터가 올바르지 않습니다.`);
    }

    if (sizeNum > MAX_AUDIO_SIZE) {
      throw new Error(`파일 ${label}: 파일 크기가 제한을 초과했습니다.`);
    }

    if (typeof contentType !== "string" || !allowedTypes.has(contentType)) {
      throw new Error(`파일 ${label}: 허용되지 않는 Content-Type 입니다 (${contentType ?? "missing"}).`);
    }

    const idxStr = custom?.["chunk-index"];
    const totalStr = custom?.["total-chunks"];
    if (!idxStr || !totalStr) {
      throw new Error(`파일 ${label}: 필수 메타데이터(chunk-index/total-chunks)가 누락되었습니다.`);
    }

    const idx = Number.parseInt(idxStr, 10);
    const total = Number.parseInt(totalStr, 10);

    if (!Number.isInteger(idx) || !Number.isInteger(total)) {
      throw new Error(`파일 ${label}: chunk-index/total-chunks 형식이 올바르지 않습니다.`);
    }
    if (total <= 0 || total > MAX_TOTAL_CHUNKS) {
      throw new Error(`파일 ${label}: total-chunks 값이 비정상입니다 (${total}).`);
    }
    if (idx < 0 || idx >= total) {
      throw new Error(`파일 ${label}: chunk-index 범위를 벗어났습니다 (${idx}/${total}).`);
    }
  }
}

// [추가] 비디오 파일 검증 로직
async function validateSourceVideo(files: GCSFile[]) {
  if (files.length !== 1) {
    throw new Error("비디오 원본 처리는 단일 파일만 가능합니다.");
  }

  const file = files[0];
  const sizeNum = Number(file.metadata.size);
  const contentType = file.metadata.contentType;
  
  // 메타데이터 플래그 확인 (이전 단계에서 넣은 'is-source' or 'is-fallback')
  const isSource = file.metadata.metadata?.['is-source'] === 'true';

  if (!isSource) {
     throw new Error("청크 메타데이터가 없는 불명확한 파일입니다.");
  }

  // 비디오 크기 제한 체크 (MAX_VIDEO_SIZE는 schemas/media 등에서 가져오거나 상수로 정의)
  // 예: const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
  // if (sizeNum > MAX_VIDEO_SIZE) { ... }

  // Content-Type 체크 (video/*)
  if (!contentType?.startsWith('video/')) {
    throw new Error(`유효하지 않은 파일 형식입니다: ${contentType}`);
  }
}

export async function generateUploadSignedUrlForSourceVideo(
  payload: videoSourceUpload,
  userId: string
) {
  const { fileName, fileType, fileSize } = videoSourceUploadSchema.parse(payload);

  try {
    const sessionId = crypto.randomUUID();
    const extension = fileName.split('.').pop() || 'mp4';
    
    // 경로 예: uploads/{userId}/{sessionId}/source.{ext}
    const storagePath = `${audioConfig.storagePath}/${userId}/${sessionId}/source.${extension}`;
    const expirationTime = Date.now() + SIGNED_URL_EXPIRES_IN_MS;

    const conditions = [
      ['content-length-range', 0, fileSize],
      ['eq', '$key', storagePath],
      ['eq', '$Content-Type', fileType],
      ['eq', '$x-goog-meta-batch-session-id', sessionId],
      ['eq', '$x-goog-meta-is-source', 'true']
    ];

    const fields: Record<string, string> = {
      "Content-Type": fileType,
      "x-goog-meta-batch-session-id": sessionId,
      "x-goog-meta-is-source": "true",
    };

    const [signedUrl] = await bucket.file(storagePath).generateSignedPostPolicyV4({
      expires: expirationTime,
      conditions,
      fields,
    });

    return { success: true, sessionId, signedUrl };
  } catch (error) {
    await logger('Error generating video signed URL: ', error);
    return { success: false, message: "비디오 업로드 URL 생성 실패" };
  }
}
