/**
 * 동영상 업로드 및 음성 변환 커스텀 훅
 *
 * 동영상 파일 선택부터 오디오 추출, 업로드, 음성 변환까지의
 * 전체 플로우를 관리합니다.
 */
import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFFmpegWorker } from "@/hooks/useFFmpegWorker";
import { useTaskStore } from "@/stores/videoStore";
import { useToast } from "@/hooks/use-toast";
import { transcribeAudioBatch } from "@/actions/transcribeActions";
import { extractAndUploadAudio } from "@/services/audioExtractionService";
import { MAX_VIDEO_SIZE } from "@/lib/schemas/media";
import { isIOS } from "@/lib/browserUtils";
import { uploadSourceVideo } from "@/services/videoUploadService";

export interface UseVideoUploadOptions {
  transcriptionPrompt?: string;
}

export function useVideoUpload(options: UseVideoUploadOptions = {}, userId: string) {
  const { transcriptionPrompt } = options;
  const router = useRouter();
  const { toast } = useToast();
  const { init, extractAudio } = useFFmpegWorker();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actions = useTaskStore((state) => state.actions);

  const resetTaskState = useCallback(() => {
    actions.setContent("");
    actions.setStatus("idle");
    actions.setErrorMessage(null);
    actions.setLastCheckedAt(null);
    actions.setJobId(null);
  }, [actions]);

  const startUploadState = useCallback((file: File) => {
    actions.setSelectedFileName(file.name);
    actions.setIsParsing(true);
    actions.setUploadProgress(0);
    actions.setStatus("uploading");
  }, [actions]);

  const finishUploadState = useCallback(() => {
    actions.setIsParsing(false);
    actions.setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [actions]);

  const validateFileSize = useCallback((file: File) => {
    if (file.size <= MAX_VIDEO_SIZE) return true;

    toast({
      title: "허용 크기 초과",
      description: "파일의 크기가 너무 큽니다.",
      variant: "destructive",
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
    return false;
  }, [toast]);

  const extractAndUpload = useCallback(async (file: File): Promise<string> => {
    if (isIOS()) {
      console.log("🍎 iOS Device detected. Skipping client-side FFmpeg.");

      toast({
        title: "iOS 환경 감지",
        description: "안정적인 처리를 위해 서버로 원본 영상을 전송합니다.",
      });

      return await uploadSourceVideo(
        file, 
        userId, 
        (progress) => actions.setUploadProgress(progress)
      );
    }

    await init();

    const sessionId = await extractAndUploadAudio(file, {
      extractAudio,
      onProgressUpdate: (progress) => {
        actions.setUploadProgress(progress);
      },
    }, userId);

    if (!sessionId) {
      throw new Error("배치 세션 ID가 생성되지 않았습니다.");
    }
    return sessionId;
  }, [init, extractAudio, actions]);

  const requestTranscription = useCallback(async (sessionId: string) => {
    actions.setStatus("processing");

    return transcribeAudioBatch({
      sessionId,
      transcriptionPrompt: transcriptionPrompt || undefined,
    }, userId);
  }, [actions, transcriptionPrompt]);

  const handleTranscriptionFailure = useCallback((result: { message?: string; error?: unknown }) => {
    console.error("Transcription failed:", result.error);
    actions.setStatus("failed");
    actions.setErrorMessage(result.message || "음성 변환 오류");
    toast({
      title: "음성 변환 오류",
      description: result.message,
      variant: "destructive",
    });
  }, [actions, toast]);

  const handleUnexpectedError = useCallback((error: unknown) => {
    console.error("An unexpected error occurred:", error);
    actions.setStatus("failed");
    actions.setErrorMessage(
      error instanceof Error ? error.message : "요청 처리 중 문제가 발생했습니다."
    );
    toast({
      title: "예기치 않은 오류",
      description: "요청 처리 중 문제가 발생했습니다.",
      variant: "destructive",
    });
  }, [actions, toast]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // 이전 변환 내용 초기화
      resetTaskState();
      if (!validateFileSize(file)) return;

      startUploadState(file);

      try {
        const sessionId = await extractAndUpload(file);
        const result = await requestTranscription(sessionId);

        if (!result.success) {
          handleTranscriptionFailure(result);
        } else {
          actions.setJobId(result.jobId!);
          toast({
            title: "음성 변환 작업 시작",
            description: "진행 상태는 '진행 상태 보기' 패널에서 확인할 수 있습니다.",
          });
        }
      } catch (e) {
        handleUnexpectedError(e);
      } finally {
        finishUploadState();
      }
    },
    [
      router,
      actions,
      resetTaskState,
      validateFileSize,
      startUploadState,
      extractAndUpload,
      requestTranscription,
      handleTranscriptionFailure,
      handleUnexpectedError,
      finishUploadState,
      toast,
    ]
  );

  return {
    fileInputRef,
    handleFileChange,
  };
}
