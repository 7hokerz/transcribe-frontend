/**
 * FFmpeg 오디오 추출 및 병렬 업로드 서비스
 *
 * 동영상에서 오디오를 추출하고, 청크 단위로 Firebase Storage에 업로드합니다.
 * 네트워크 품질에 따라 동적으로 병렬 업로드 개수를 조정합니다.
 */

import pLimit from "p-limit";
import { generateUploadSignedUrlForAudio } from "@/actions/transcribeActions";
import type { AudioSignedUrlItem } from "@/actions/schemas/file";
import { detectNetworkConfig } from "@/lib/networkQuality";
import { uploadSingleChunk } from "./videoUploadService";
import { OnChunkCallback, OnMetadataCallback, SendNext } from "@/hooks/useFFmpegWorker";
import { AudioChunk, AudioMetadata } from "@/lib/schemas/media";

export interface AudioExtractionCallbacks {
  extractAudio: (
    videoFile: File,
    onMetadata: OnMetadataCallback,
    onChunk: OnChunkCallback
  ) => Promise<void>;

  onProgressUpdate: (progress: number) => void;
}

async function prepareSignedUrlsForAudio(
  metadata: AudioMetadata,
  signedUrlMap: Map<number, AudioSignedUrlItem>,
  userId: string,
): Promise<string> {
  const chunkSizes = metadata.chunks.map((chunk) => chunk.size);

  // Signed URL 생성
  const res = await generateUploadSignedUrlForAudio({
    fileType: metadata.mimeType,
    totalChunks: metadata.totalChunks,
    chunkSizes,
  }, userId);

  if (!res.success || !res.uploads || !res.sessionId) {
    throw new Error(res.message || "Signed URL 생성에 실패했습니다.");
  }

  const sessionId = res.sessionId;
  const signedUrls = res.uploads;

  signedUrlMap.clear();
  signedUrls.forEach((u: AudioSignedUrlItem) => signedUrlMap.set(u.chunkIndex, u));

  return sessionId;
}

async function uploadAudioChunk(
  chunk: AudioChunk,
  signedUrlMap: Map<number, AudioSignedUrlItem>,
  chunkProgressMap: Map<string, number>,
  updateOverallProgress: () => void,
) {
  const signedUrlData = signedUrlMap.get(chunk.index);
  if (!signedUrlData) throw new Error(`청크 ${chunk.index}에 대한 Signed URL을 찾을 수 없습니다.`);

  chunkProgressMap.set(chunk.name, 0);

  const chunkFile = new File([chunk.buffer], chunk.name, { type: chunk.mimeType });
  if (process.env.NODE_ENV === 'development') console.log(`청크 ${chunk.index}: ${(chunkFile.size / 1024 / 1024).toFixed(2)} MB`);

  await uploadSingleChunk(
    chunkFile,
    signedUrlData.signedUrl,
    chunk.name,
    (chunkName, progress) => {
      chunkProgressMap.set(chunkName, progress);
      updateOverallProgress();
    }
  );
}

/**
 * 동영상 파일에서 오디오를 추출하고 Firebase Storage에 병렬 업로드합니다.
 *
 * @param videoFile - 동영상 파일
 * @param callbacks - 오디오 추출 및 진행률 콜백
 * @returns 배치 세션 ID
 */
export async function extractAndUploadAudio(
  videoFile: File,
  callbacks: AudioExtractionCallbacks,
  userId: string
): Promise<string | undefined> {
  const { extractAudio, onProgressUpdate } = callbacks;
  const { maxConcurrency } = detectNetworkConfig();

  const limit = pLimit(maxConcurrency);
  const uploadPromises: Promise<void>[] = [];

  const chunkProgressMap = new Map<string, number>();
  const signedUrlMap = new Map<number, AudioSignedUrlItem>();

  let totalChunks = 0;
  let sessionId;

  const updateOverallProgress = () => {
    if (!totalChunks) return;

    const totalProgress = Array.from(chunkProgressMap.values()).reduce((a, b) => a + b, 0);
    onProgressUpdate(Math.round(totalProgress / totalChunks));
  };

  const hasNextChunk = (idx: number) => idx < totalChunks - 1;

  const sendNextChunk = (currentChunkIndex: number, sendNext: SendNext) => {
    if (!hasNextChunk(currentChunkIndex)) return;

    const inFlight = limit.activeCount + limit.pendingCount;
    if (inFlight < maxConcurrency) sendNext();
  }

  await extractAudio(
    videoFile,
    async (metadata) => {
      totalChunks = metadata.totalChunks;

      sessionId = await prepareSignedUrlsForAudio(
        metadata,
        signedUrlMap,
        userId
      );
    },
    (chunk, sendNext) => {
      const task = limit(async () => {
        try {
          await uploadAudioChunk(
            chunk,
            signedUrlMap,
            chunkProgressMap,
            updateOverallProgress,
          );
        } finally {
          sendNextChunk(chunk.index, sendNext);
        }
      });

      uploadPromises.push(task);

      sendNextChunk(chunk.index, sendNext);
    }
  );

  function assertSessionId(id: string | undefined): asserts id is string {
    if (!id) throw new Error("세션 ID가 생성되지 않았습니다. (Signed URL 응답 이상)");
  }

  try {
    await Promise.all(uploadPromises);
    onProgressUpdate(100);

    assertSessionId(sessionId);
    return sessionId;
  } catch (error) {
    onProgressUpdate(0);
    throw error;
  } finally {
    chunkProgressMap.clear();
    signedUrlMap.clear();
    uploadPromises.length = 0;
  }
}
