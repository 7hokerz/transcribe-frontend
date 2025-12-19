'use server';
import crypto from 'crypto';
import pLimit from 'p-limit';
import { logger } from '@/lib/logger';
import { adminFirestore, adminStorage, bucket } from '@/config/firebase-admin';
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
  AUDIO_MIME_TYPE_TO_EXTENSIONS
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

async function _generateUploadSignedUrlForAudio(
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

async function _transcribeAudioBatch(
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

    await validateFiles(files);

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

async function _getTranscriptionResult(
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
      const cacheDoc = await adminFirestore.collection(CONTENT_CACHE_COLLECTION).doc(`${jobId}:meta`).get();
      const data = cacheDoc.data() || {};

      const snippet = data.data.snippet;
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

async function validateFiles(audios: any[]) {
  const metadataPromises = audios.map(audio => audio.metadata);
  const allMetadata = await Promise.all(metadataPromises);

  for (const audioMetadata of allMetadata) {
    const { size, contentType, metadata: customMetadata } = audioMetadata;

    if (Number(size) > MAX_AUDIO_SIZE || !audioConfig.mimeType.includes(contentType)) {
      throw new Error(`청크 ${customMetadata?.index}: 잘못된 파일 속성`);
    }

    if (!customMetadata || !customMetadata['chunk-index'] || !customMetadata['total-chunks']) {
      throw new Error(`청크 ${customMetadata?.index}: 필수 메타데이터 누락`);
    }

    const index = parseInt(customMetadata['chunk-index']);
    const totalChunks = parseInt(customMetadata['total-chunks']);
    if (index < 0 || index >= totalChunks || totalChunks > MAX_TOTAL_CHUNKS) {
      throw new Error(`청크 ${index}: 잘못된 인덱스 또는 전체 청크 수`);
    }
  }
}

export const generateUploadSignedUrlForAudio = _generateUploadSignedUrlForAudio;

export const getTranscriptionResult = _getTranscriptionResult;

export const transcribeAudioBatch = _transcribeAudioBatch;
