/**
 * States:
 * - "new"        : 클라이언트 생성 직후(또는 init 실패 후).
 * - "loading"    : init() 요청을 Worker에 보낸 상태. "ready"를 기다림.
 * - "ready"      : Worker가 초기화 완료(FFmpeg 로드됨).
 * - "busy"       : extractAudio 진행 중. 
 * - "terminated" : terminate()로 Worker 종료. 모든 내부 핸들/Promise/Task 리셋.
 * 
 */
import { AudioChunk, AudioMetadata } from "@/lib/schemas/media";
import { useEffect, useMemo } from "react";

// sendNext 함수 타입: 워커에 다음 청크를 요청
export type SendNext = () => void;

export type OnMetadataCallback = (metadata: AudioMetadata) => Promise<void>;

export type OnChunkCallback = (chunk: AudioChunk, sendNext: SendNext) => void;

type State = "new" | "loading" | "ready" | "busy" | "terminated";

interface Task {
    resolve: () => void;
    reject: (reason?: any) => void;
    onMetadata: OnMetadataCallback;
    onChunk: OnChunkCallback;
}

class FFmpegWorkerClient {
    private worker: Worker | null = null;

    private state: State = "new";

    private initPromise: Promise<void> | null = null;
    private initResolver: (() => void) | null = null;
    private initRejecter: ((e: any) => void) | null = null;

    private currentTask: Task | null = null;

    private cleanupTimer: ReturnType<typeof setTimeout> | null = null;

    private readonly INACTIVITY_TIMEOUT = 10 * 60 * 1000;

    private workerFactory: () => Worker;

    constructor() {
        this.workerFactory = (() => new Worker(new URL('../lib/ffmpegWorker.ts', import.meta.url)));
    }

    terminate() {
        this.stopTimer();
        this.state = "terminated";

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        this.initPromise = null;
        this.initResolver = null;
        this.initRejecter = null;

        if (this.currentTask) {
            this.currentTask.reject(new Error("Worker terminated"));
            this.currentTask = null;
        }
    }

    async init(): Promise<void> {
        this.registerWorker();

        if (this.state === "ready") return;
        if (this.state === "busy") return;

        if (this.initPromise) return this.initPromise;

        this.state = "loading";

        this.initPromise = new Promise<void>((resolve, reject) => {
            this.initResolver = resolve;
            this.initRejecter = reject;

            try {
                this.worker!.postMessage({ type: "init" });
            } catch (e) {
                reject(e);
            }
        });

        return this.initPromise;
    }

    async extractAudio(
        file: File,
        onMetadata: (metadata: AudioMetadata) => Promise<void>,
        onChunk: OnChunkCallback,
    ): Promise<void> {
        if (this.currentTask) {
            return Promise.reject(new Error("A conversion is already in progress."));
        }

        await this.init();
        this.registerWorker();

        this.stopTimer();
        this.state = "busy";

        const worker = this.worker!;
        const fileStream = file.stream();

        return new Promise<void>((resolve, reject) => {
            this.currentTask = { resolve, reject, onMetadata, onChunk };

            try {
                worker.postMessage({
                    type: "extractAudio",
                    stream: fileStream,
                    fileName: file.name,
                    fileType: file.type
                }, [fileStream]);
            } catch (e) {
                this.failTask(e);
            }
        });
    }

    private registerWorker() {
        if (this.worker) return;

        const worker = this.workerFactory();

        worker.onmessage = (e) => {
            const { type, data, error } = e.data;

            if (type === "ready") {
                this.state = "ready";
                this.initResolver?.();
                this.initResolver = null;
                this.initRejecter = null;
                this.startTimer();
                return;
            }

            if (type === "error" && this.state === "loading") {
                this.state = "new";
                this.initRejecter?.(error ?? new Error("Worker init failed"));
                this.initResolver = null;
                this.initRejecter = null;
                this.initPromise = null; // 재시도 가능하게
                this.startTimer();
                return;
            }

            if (!this.currentTask) return;

            if (type === "metadata") {
                this.handleMetadata(data).catch((err) => this.failTask(err));
                return;
            }

            if (type === "chunk_data") {
                const sendNext = () => {
                    if (this.currentTask) worker.postMessage({ type: "send_next_chunk" });
                };
                this.currentTask.onChunk(data, sendNext);
                return;
            }

            if (type === "done") {
                this.finishTask();
                return;
            }

            if (type === "error") {
                this.failTask(error);
                return;
            }
        };

        worker.onerror = (ev) => {
            const err = ev instanceof ErrorEvent ? (ev.error ?? ev.message) : ev;

            if (this.state === "loading") {
                this.state = "new";
                this.initRejecter?.(err);
                this.initResolver = null;
                this.initRejecter = null;
                this.initPromise = null;
                return;
            }

            this.failTask(err);
        }

        worker.onmessageerror = (ev) => {
            if (this.state === "loading") {
                this.state = "new";
                this.initRejecter?.(ev);
                this.initResolver = null;
                this.initRejecter = null;
                this.initPromise = null;
                return;
            }
            this.failTask(ev);
        };

        this.worker = worker;
        this.state = "new";
    }

    private async handleMetadata(metadata: AudioMetadata) {
        if (!this.currentTask) return;

        await this.currentTask.onMetadata(metadata);

        // 명시적 실패 처리로 메인 스레드 무한 블로킹 방지
        if (!this.worker) {
            throw new Error("Worker missing before start_chunks");
        }

        this.worker.postMessage({ type: "start_chunks" });
    }

    private finishTask() {
        if (!this.currentTask) return;

        this.currentTask.resolve();
        this.currentTask = null;

        this.state = "ready";
        this.startTimer();
    }

    private failTask(reason: any) {
        if (!this.currentTask) return;

        this.currentTask.reject(reason);
        this.currentTask = null;

        this.state = "ready";
        this.startTimer();
    }

    private startTimer() {
        if (!this.worker) return;
        if (this.state !== "ready") return;
        if (this.currentTask) return;

        this.stopTimer();
        this.cleanupTimer = setTimeout(() => {
            if (this.worker && this.state === "ready" && !this.currentTask) {
                console.log("🧹 FFmpeg worker terminated due to inactivity");
                this.terminate();
            }
        }, this.INACTIVITY_TIMEOUT);
    }

    private stopTimer() {
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
}

export const useFFmpegWorker = () => {
    const client = useMemo(() => getClient(), []);

    useEffect(() => {
        return () => {
            client.terminate();
        };
    }, []);

    return {
        init: () => client.init(),
        extractAudio: (
            file: File,
            onMetadata: (m: AudioMetadata) => Promise<void>,
            onChunk: OnChunkCallback
        ) => client.extractAudio(file, onMetadata, onChunk),
    };
}

const CLIENT_KEY = Symbol.for("FFmpegWorkerClientSingleton");

function getClient() {
    registerHmrDisposeOnce();
    const g = globalThis as any;
    if (!g[CLIENT_KEY]) g[CLIENT_KEY] = new FFmpegWorkerClient();
    return g[CLIENT_KEY] as FFmpegWorkerClient;
}

// HMR 시 정리: Next dev(webpack)에서 효과적
function registerHmrDisposeOnce() {
    if (process.env.NODE_ENV !== "development") return;

    const hot =
        (import.meta as any).webpackHot || // webpack strict ESM
        (globalThis as any).module?.hot;   // CJS 환경이면 module.hot

    if (!hot) return;

    const FLAG_KEY = "__ffmpeg_worker_hmr_dispose_registered__";
    const g = globalThis as any;
    if (g[FLAG_KEY]) return;
    g[FLAG_KEY] = true;

    hot.dispose(() => {
        const inst = (globalThis as any)[CLIENT_KEY] as FFmpegWorkerClient | undefined;
        inst?.terminate();
        delete (globalThis as any)[CLIENT_KEY];
        delete g[FLAG_KEY];
    });
}