/// <reference lib="webworker" />

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { MAX_AUDIO_BITRATE, SignalType, SUPPORTED_CODECS, WorkerInMessage } from "./schemas/media";

/**
 * 
 * Main -> Worker
 * - { type: "init" }                   // FFmpeg 로드
 * - { type: "extractAudio", fileName, fileType, stream }
 * - { type: "start_chunks" }           // 메인 스레드 준비 완료, 청크 전송 시작 요청
 * - { type: "send_next_chunk" }        // 다음 청크 전송 요청
 * 
 * Worker -> Main
 * - { type: "ready" }
 * - { type: "metadata", data: { totalChunks, mimeType, chunks[...] } }
 * - { type: "chunk_data", data: { index, name, buffer, totalChunks, mimeType } }
 * - { type: "done" }
 * - { type: "error", error: string }
 * 
 */

const MediaUtils = {
  getCodecInfo(fileName: string) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const extToCodec: Record<string, keyof typeof SUPPORTED_CODECS> = {
      'mp4': 'aac',
      'mov': 'aac',
      'm4v': 'aac',
      '3gp': 'aac',
      '3g2': 'aac',
      'f4v': 'aac',
      'mts': 'aac',
      'm2ts': 'aac',
      'webm': 'opus',
      'mpg': 'mp3',
      'mpeg': 'mp3',
    };
    const codecKey = extToCodec[ext];
    return codecKey ? SUPPORTED_CODECS[codecKey] : null;
  },

  async streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }
    } finally {
      try { // 스트림 가비지 컬렉션 및 재사용 가능하게 잠금 해제
        reader.releaseLock();
      } catch (e) { }
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

class FFmpegService {
  private ffmpeg: FFmpeg;
  private isLoaded = false;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  async load() {
    if (this.isLoaded) {
      console.log('✅ FFmpeg already loaded, skipping initialization');
      return;
    }

    await this.ffmpeg.load({
      coreURL: "/ffmpeg/ffmpeg-core.js",
      wasmURL: "/ffmpeg/ffmpeg-core.wasm",
    });

    this.isLoaded = true;
    console.log("✅ FFmpeg loaded successfully");
  }

  async readFile(fileName: string): Promise<Uint8Array> {
    return (await this.ffmpeg.readFile(fileName)) as Uint8Array;
  }

  async writeFile(fileName: string, data: Uint8Array) {
    await this.ffmpeg.writeFile(fileName, data);
  }

  async deleteFile(fileName: string) {
    try {
      await this.ffmpeg.deleteFile(fileName);
    } catch (e) { /* Ignore check err */ }
  }

  /** FFmpeg 로그를 파싱하여 오디오 비트레이트 측정 */
  async checkBitrate(fileName: string): Promise<number> {
    let bitrate = 0;
    const logHandler = ({ message }: { message: string }) => {
      if (bitrate > 0) return;
      // "Stream #0:1(und): Audio: aac (LC) ... 128 kb/s" 패턴 찾기
      const bitrateMatch = message.match(/Audio:.*?(\d+)\s*kb\/s/i);
      if (bitrateMatch) {
        bitrate = parseInt(bitrateMatch[1], 10);
      }
    };

    this.ffmpeg.on('log', logHandler);
    try {
      await this.ffmpeg.exec(["-i", fileName]);
    } catch (e) {
      /* Ignore check err */
    } finally {
      this.ffmpeg.off("log", logHandler);
    }

    return bitrate;
  }

  /** 청크 분할 */
  async convertToChunks(fileName: string, extension: string): Promise<string[]> {
    const outputPattern = `chunk_%02d.${extension}`;

    const args = [
      "-avoid_negative_ts", "make_zero",
      "-i", fileName,
      "-vn",
      "-map", "0:a:0",

      "-c:a", "copy",             // 별도 인코딩 X

      "-f", "segment",
      "-segment_time", "900",     // 청크 분할 길이 (900 === 15분)
      "-reset_timestamps", "1",
      "-map_metadata", "-1",      // (선택적/정보성) 메타데이터 제거
    ];

    if (extension === 'm4a') {
      args.push("-movflags", "+faststart");
    }

    args.push(outputPattern);

    await this.ffmpeg.exec(args);

    const dirEnts = await this.ffmpeg.listDir('.');
    return dirEnts
      .map(d => d.name)
      .filter(name => name.startsWith("chunk_") && name.endsWith(`.${extension}`))
      .sort();
  }

  /** 작업 완료 후 가상 파일 시스템(MEMFS) 정리 */
  async cleanupFile(fileName: string) {
    try {
      await this.ffmpeg.deleteFile(fileName);
      const dirEnts = await this.ffmpeg.listDir('.');
      const chunkFileNames = dirEnts.map(d => d.name).filter(name => name.startsWith("chunk_"));
      for (const name of chunkFileNames) {
        await this.ffmpeg.deleteFile(name);
      }
    } catch (e) { /* Ignore check err */ }
  }
}

class WorkerController {
  private svc: FFmpegService;

  constructor() {
    this.svc = new FFmpegService();
    self.addEventListener("message", (e: MessageEvent) => this.handleMessage(e));
  }

  private async handleMessage(e: MessageEvent) {
    const data = e.data as Partial<WorkerInMessage>;
    const type = data?.type;

    // 청크 흐름 제어용 신호는 별도의 리스너(waitForSignal)에서 처리하므로 무시
    if (type === "start_chunks" || type === "send_next_chunk") return;

    try {
      switch (type) {
        case "init":
          await this.handleInit();
          break;
        case "extractAudio":
          await this.handleExtractAudio(data as Extract<WorkerInMessage, { type: "extractAudio" }>);
          break;
        default:
          break;
      }
    } catch (err: any) {
      console.error(err);
      self.postMessage({ type: "error", error: err?.message ?? String(err) });
    }
  }

  private async handleInit() {
    console.log('🚀 Initializing FFmpeg...');
    console.time("ffmpeg load");
    await this.svc.load();
    console.timeEnd("ffmpeg load");
    self.postMessage({ type: "ready" });
  }

  private async handleExtractAudio(payload: Extract<WorkerInMessage, { type: "extractAudio" }>) {
    const { fileName, fileType, stream } = payload;

    if (!fileType?.startsWith('video/')) throw new Error("비디오 파일만 지원합니다.");

    const codecInfo = MediaUtils.getCodecInfo(fileName);
    if (!codecInfo) throw new Error("지원하지 않는 코덱입니다.");

    try {
      console.time("FFmpeg Task");

      const fileData = await MediaUtils.streamToUint8Array(stream);
      await this.svc.writeFile(fileName, fileData);

      const bitrate = await this.svc.checkBitrate(fileName);
      if (bitrate > MAX_AUDIO_BITRATE) {
        throw new Error(`비트레이트 초과: ${bitrate}kbps > ${MAX_AUDIO_BITRATE}kbps`);
      }

      const chunkFileNames = await this.svc.convertToChunks(fileName, codecInfo.extension);

      await this.processChunksFlow(chunkFileNames, codecInfo.mimeType, {
        codec: codecInfo.codec,
        audioBitrateKbps: bitrate,
      });

      self.postMessage({ type: "done" });

      console.timeEnd("FFmpeg Task");
    } finally {
      await this.svc.cleanupFile(fileName);
    }
  }

  /**
   * 청크 전송 흐름 제어
   * 백프레셔 기반으로 청크를 순차적으로 전송
   */
  private async processChunksFlow(
    chunkFileNames: string[],
    mimeType: string,
    meta: { codec: string; audioBitrateKbps: number }
  ) {
    const totalChunks = chunkFileNames.length;

    // 1. 메타데이터 생성 및 전송
    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      const data = await this.svc.readFile(chunkFileNames[i]);
      chunks.push({
        index: i,
        size: data.byteLength
      });
    }

    self.postMessage({
      type: "metadata",
      data: {
        codec: meta.codec,
        audioBitrateKbps: meta.audioBitrateKbps,
        totalChunks,
        mimeType,
        chunks
      }
    });

    // 2. 메인 스레드 Signed-URL 생성 완료 대기
    console.log('⏳ Waiting for signed URLs to be ready...');
    await this.waitForSignal("start_chunks");
    console.log('✅ Received start_chunks signal, beginning chunk transmission');

    // 3. 청크 순차 전송
    for (let i = 0; i < totalChunks; i++) {
      // 다음 전송 신호를 기다리는 Promise 생성
      const waitNext = (i < totalChunks - 1) ? this.waitForSignal("send_next_chunk") : null;

      const name = chunkFileNames[i];
      const data = await this.svc.readFile(name);

      // data.buffer는 FFmpeg의 전체 메모리를 가리킬 수 있으므로,
      // slice()를 통해 깊은 복사
      const buffer = data.slice().buffer;
      self.postMessage({
        type: "chunk_data",
        data: {
          index: i,
          name: name,
          buffer,
          totalChunks,
          mimeType
        }
      }, [buffer]);

      await this.svc.deleteFile(name);

      if (waitNext) await waitNext;
    }
  }

  private waitForSignal(signalType: SignalType): Promise<void> {
    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === signalType) {
          self.removeEventListener("message", handler);
          resolve();
        }
      };
      self.addEventListener("message", handler);
    });
  }
}

new WorkerController();
