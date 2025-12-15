"use client";

import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import type { FormInvalidHandler } from "@/hooks/use-form-invalid-handler";
import { registerServiceWorker } from "@/lib/serviceWorker";
import { useTaskStore } from "@/stores/videoStore";
import { ContentPreview } from "@/components/shared/content-preview";
import { UploadInfoBanner } from "@/components/shared/upload-info-banner";
import { FileUploadButton } from "@/components/shared/file-upload-button";
import { TranscriptionPromptDialog } from "@/components/video-upload/transcription-prompt-dialog";
import { useVideoUpload } from "@/hooks/useVideoUpload";
import { StatusPanelDialog } from "@/components/video-upload/status-panel-dialog";
import { Button } from "./ui/button";

interface VideoFormProps {
  onInvalid: FormInvalidHandler;
  userId: string
}

export function VideoForm({ onInvalid, userId }: VideoFormProps) {
  const [transcriptionPrompt, setTranscriptionPrompt] = useState("");
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);

  const isParsing = useTaskStore((state) => state.isParsing);
  const selectedFileName = useTaskStore((state) => state.selectedFileName);
  const finalText = useTaskStore((state) => state.finalText);
  const uploadProgress = useTaskStore((state) => state.uploadProgress);

  const { fileInputRef, handleFileChange } = useVideoUpload({
    transcriptionPrompt,
  }, userId);

  useEffect(() => {
    registerServiceWorker();
  }, [registerServiceWorker]);

  const uploadInfo = UploadInfoBanner({
    info: [
      "허용 확장자: MP4, MOV, M4V, 3GP, 3G2, F4V, MTS, M2TS, WEBM, MPG, MPEG",
      "최대 동영상 파일 크기: 500MB",
      "높은 비트레이트 (256kbps ~ ) 의 경우 추출이 제한될 수 있습니다."
    ]
  });

  return (
    <>
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium">동영상 업로드</h3>
            {uploadInfo.button}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsStatusDialogOpen(true)}
            >
              진행 상태 보기
            </Button>
            <TranscriptionPromptDialog
              value={transcriptionPrompt}
              onChange={setTranscriptionPrompt}
            />
          </div>
        </div>
        {uploadInfo.banner}
        <FileUploadButton
          ref={fileInputRef}
          id="video-upload"
          accept="video/*"
          onChange={handleFileChange}
          isLoading={isParsing}
          icon={<Video className="mr-2 h-4 w-4" />}
          defaultText="비디오 파일 선택"
          selectedText="다른 비디오 파일 선택"
          hasFile={!!selectedFileName}
          selectedFileName={selectedFileName || undefined}
          uploadProgress={uploadProgress}
        />
        <ContentPreview
          title="변환된 텍스트 (미리보기)"
          content={finalText || ""}
          placeholder="변환된 텍스트가 여기에 표시됩니다."
          isProcessing={isParsing}
          processingText="동영상의 음성을 텍스트로 변환 중입니다..."
          textareaHeight="h-40"
        />
      </div>
      <StatusPanelDialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen} userId={userId} />
    </>
  );
}
