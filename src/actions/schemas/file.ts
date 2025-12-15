import { SignedPostPolicyV4Output } from '@google-cloud/storage';
import { z } from 'zod';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
export const MAX_TOTAL_CHUNKS = 100;
export const SIGNED_URL_EXPIRES_IN_MS = 5 * 60 * 1000; // 5분

// 오디오 MIME 타입 - 확장자 매핑
export const AUDIO_MIME_TYPE_TO_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/opus': 'ogg',
};

export interface FileTypeConfig {
  mimeType: string | string[];
  storagePath: string;
  maxSizeBytes: number;
  featureName: 'AudioUpload';
}

export const audioConfig: FileTypeConfig = {
  mimeType: Object.keys(AUDIO_MIME_TYPE_TO_EXTENSIONS),
  storagePath: 'audios',
  maxSizeBytes: MAX_AUDIO_SIZE,
  featureName: 'AudioUpload',
}

/**
 * 오디오 업로드 전 검증 및 Signed URL 발급 스키마 (배치)
 */
export const audioUploadSchema = z.object({
  fileType: z.string()
    .trim()
    .refine(type => audioConfig.mimeType.includes(type), '허용되지 않은 파일 형식입니다.'),

  totalChunks: z.number()
    .int('총 청크 개수는 정수여야 합니다.')
    .min(1, '청크 개수가 너무 적습니다.')
    .max(MAX_TOTAL_CHUNKS, `최대 ${MAX_TOTAL_CHUNKS}개 청크까지 가능합니다.`),

  chunkSizes: z.array(z.number()
    .positive('파일 크기는 양수여야 합니다.')
    .max(audioConfig.maxSizeBytes, `파일 크기가 ${audioConfig.maxSizeBytes / (1024 * 1024)}MB를 초과합니다.`), {
    invalid_type_error: '청크 크기 목록은 배열이어야 합니다.',
  })
    .min(1, '최소 1개 청크가 필요합니다.')
    .max(MAX_TOTAL_CHUNKS, `최대 ${MAX_TOTAL_CHUNKS}개 청크까지 가능합니다.`),
})
  .refine(data => data.chunkSizes.length === data.totalChunks, {
    message: '청크 크기 배열의 길이가 총 청크 개수와 일치하지 않습니다.',
    path: ['chunkSizes'],
  });
export type audioUpload = z.infer<typeof audioUploadSchema>;

export const AudioSignedUrlItemSchema = z.object({
  chunkIndex: z.number()
    .int('인덱스는 정수여야 합니다.')
    .min(0, '인덱스가 너무 작습니다.'),

  fileName: z.string()
    .trim()
    .min(1, '파일명이 필요합니다.'),

  signedUrl: z.custom<SignedPostPolicyV4Output>(),
});
export type AudioSignedUrlItem = z.infer<typeof AudioSignedUrlItemSchema>;

export const audioUploadOutputSchema = z.object({
  success: z.boolean(),
  sessionId: z.string()
    .trim()
    .uuid('유효하지 않은 세션 ID입니다.')
    .optional(),

  uploads: z.array(AudioSignedUrlItemSchema, {
    invalid_type_error: '업로드 목록은 배열이어야 합니다.',
  }).optional(),

  message: z.string()
    .trim()
    .optional(),
});
export type audioUploadOutput = z.infer<typeof audioUploadOutputSchema>;

export const audioExtractSchema = z.object({
  sessionId: z.string()
    .trim()
    .uuid('유효하지 않은 세션 ID입니다.'),

  transcriptionPrompt: z.string()
    .trim()
    .max(220, 'prompt는 220자 이하여야 합니다.')
    .optional(),
});
export type audioExtract = z.infer<typeof audioExtractSchema>;

export const audioJobStatusSchema = z.object({
  jobId: z.string()
    .trim()
    .min(1, '유효하지 않은 작업 ID입니다.'),
});
export type audioJobStatus = z.infer<typeof audioJobStatusSchema>;

// 파일명 sanitization (경로 조작 공격 방지)
function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[\/\\]/g, '') // 경로 구분자 제거
    .replace(/\0/g, '') // null byte 제거
    .replace(/\.\./g, '') // 상위 디렉토리 참조 제거
    .replace(/\.{2,}/g, '.') // 연속된 점을 하나로
    .trim() // 공백 제거
    .replace(/^\.+|\.+$/g, '') // 시작/끝 점 제거
    .slice(0, 255); // 파일명 길이 제한
}
