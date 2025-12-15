// 미디어 파일 처리 관련 타입 정의

// ffmpeg 오디오 청크
export interface AudioChunk {
  index: number;
  name: string;
  buffer: ArrayBuffer;
  totalChunks: number;
  mimeType: string;
}

// ffmpeg 오디오 청크 메타데이터 (개별 청크)
export interface AudioChunkMetadata {
  index: number;
  size: number;
}

// ffmpeg 오디오 전체 메타데이터
export interface AudioMetadata {
  codec: keyof typeof SUPPORTED_CODECS;
  audioBitrateKbps: number;
  totalChunks: number;
  mimeType: string;
  chunks: AudioChunkMetadata[];
}

// 최대 파일 용량 제한
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB

// 최대 비트레이트 제한 (kbps)
export const MAX_AUDIO_BITRATE = 192; // 192kbps

// 코덱별 확장자 및 MIME type 매핑
export const SUPPORTED_CODECS: Record<string, { codec: string; extension: string; mimeType: string }> = {
  'aac': { codec: 'aac', extension: 'm4a', mimeType: 'audio/mp4' },
  'opus': { codec: 'opus', extension: 'ogg', mimeType: 'audio/opus' },
  'mp3': { codec: 'mp3', extension: 'mp3', mimeType: 'audio/mpeg' },
} as const;

export type SignalType = "start_chunks" | "send_next_chunk";

export type WorkerInMessage = 
  | { type: "init" }
  | {
      type: "extractAudio";
      fileName: string;
      fileType: string;
      stream: ReadableStream<Uint8Array>;
    }
  | { type: SignalType };

export type WorkerOutMessage = 
  | { type: "ready" }
  | { 
      type: "metadata";
      data: AudioMetadata;
    }
  | {
      type: "chunk_data";
      data: AudioChunk;
    }
  | { type: "done" }
  | { type: "error"; error: string };
