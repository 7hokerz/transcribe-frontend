"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSessionStorage } from "@/hooks/use-session-storage";
import { useTaskStore } from "@/stores/videoStore";
import { getTranscriptionResult } from "@/actions/transcribeActions";
import { RefreshCw } from "lucide-react";

interface StatusPanelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

const AUTO_POLL_INTERVAL_MS = 5000;
const MAX_AUTO_POLL_ATTEMPTS = 4;

export function StatusPanelDialog({ open, onOpenChange, userId }: StatusPanelDialogProps) {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { setValue: setContentCacheKey } = useSessionStorage("currentContentCacheKey");
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptRef = useRef(0);
  const statusRef = useRef<ReturnType<typeof useTaskStore.getState>["status"]>("idle");
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const status = useTaskStore((state) => state.status);
  const jobId = useTaskStore((state) => state.jobId);
  const lastCheckedAt = useTaskStore((state) => state.lastCheckedAt);
  const errorMessage = useTaskStore((state) => state.errorMessage);
  const actions = useTaskStore((state) => state.actions);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const lastCheckedLabel = useMemo(() => {
    if (!lastCheckedAt) return "—";
    try {
      return new Date(lastCheckedAt).toLocaleString();
    } catch {
      return lastCheckedAt;
    }
  }, [lastCheckedAt]);

  const handleRefreshStatus = useCallback(async () => {
    if (isRefreshingRef.current) return;
    if (!jobId) {
      toast({
        title: "진행 중인 작업 없음",
        description: "먼저 동영상 업로드를 진행해 주세요.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsRefreshing(true);
      isRefreshingRef.current = true;

      const statusResult = await getTranscriptionResult({ jobId }, userId);
      
      actions.setLastCheckedAt(new Date().toISOString());

      if (!statusResult.success) {
        const message = statusResult.message || "Failed to fetch transcription status.";
        actions.setStatus("failed");
        actions.setErrorMessage(message);
        toast({
          title: "상태 조회 실패",
          description: message,
          variant: "destructive",
        });
        return;
      }

      if (statusResult.status === "done") {
        actions.setStatus("done");
      } else if (statusResult.status === "failed" || statusResult.status === "unauthorized") {
        const message = statusResult.message || "음성 변환 실패";
        actions.setStatus("failed");
        actions.setErrorMessage(message);
        toast({
          title: "작업 실패",
          description: message,
          variant: "destructive",
        });
      } else {
        actions.setStatus("processing");
      }
    } catch (error) {
      console.error("Refresh status error:", error);
      actions.setStatus("failed");
      actions.setErrorMessage(
        error instanceof Error ? error.message : "상태 조회 중 오류가 발생했습니다."
      );
      actions.setLastCheckedAt(new Date().toISOString());
      toast({
        title: "상태 조회 오류",
        description: "상태를 가져오는 중 문제가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, [jobId, toast, actions]);

  useEffect(() => {
    if (!open || !jobId || statusRef.current === "done" || statusRef.current === "failed") {
      return;
    }

    pollAttemptRef.current = 0;

    const clearTimer = () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    const runPoll = async () => {
      if (isRefreshingRef.current) return;
      if (statusRef.current === "done" || statusRef.current === "failed") {
        clearTimer();
        return;
      }

      pollAttemptRef.current += 1;
      await handleRefreshStatus();

      if (pollAttemptRef.current >= MAX_AUTO_POLL_ATTEMPTS) {
        clearTimer();
      }
    };

    void runPoll();
    pollingTimerRef.current = setInterval(() => {
      if (pollAttemptRef.current >= MAX_AUTO_POLL_ATTEMPTS) {
        clearTimer();
        return;
      }
      void runPoll();
    }, AUTO_POLL_INTERVAL_MS);

    return clearTimer;
  }, [open, jobId, handleRefreshStatus]);


  const handleFetchResult = useCallback(async () => {
    if (!jobId) {
      toast({
        title: "진행 중인 작업 없음",
        description: "먼저 동영상 업로드를 진행해 주세요.",
        variant: "destructive",
      });
      return;
    }

    try {
      const statusResult = await getTranscriptionResult({ jobId }, userId);

      if (!statusResult.success) {
        const message = statusResult.message || "Failed to fetch transcription result.";
        toast({
          title: "결과 조회 실패",
          description: message,
          variant: "destructive",
        });
        return;
      }

      if (statusResult.status !== "done" || !statusResult.transcript) {
        toast({
          title: "아직 완료되지 않음",
          description: "작업이 완료되지 않았거나 결과가 아직 준비되지 않았습니다.",
          variant: "destructive",
        });
        return;
      }

      if (statusResult.cacheKey) {
        setContentCacheKey(statusResult.cacheKey);
      }
      actions.setContent(statusResult.transcript);
      actions.setStatus("done");
      actions.setErrorMessage(null);

      onOpenChange(false);
    } catch (error) {
      console.error("Fetch result error:", error);
      toast({
        title: "결과 조회 오류",
        description: "결과를 가져오는 중 문제가 발생했습니다.",
        variant: "destructive",
      });
    }
  }, [jobId, toast, actions, setContentCacheKey, onOpenChange]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "idle":
        return "대기 중";
      case "uploading":
        return "업로드 중";
      case "processing":
        return "변환 중";
      case "done":
        return "완료";
      case "failed":
        return "실패";
      default:
        return status;
    }
  }, [status]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>동영상 변환 진행 상태</DialogTitle>
          <DialogDescription>
            현재 업로드된 동영상의 음성 변환 작업 상태를 확인하고, 완료 시 결과를 불러올 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">현재 상태</span>
            <span>{statusLabel}</span>
          </div>

          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">Job ID</span>
            <span className="truncate max-w-[200px]" title={jobId || ""}>
              {jobId ?? "—"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">마지막 상태 확인</span>
            <span>{lastCheckedLabel}</span>
          </div>

          {errorMessage && (
            <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {errorMessage}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleRefreshStatus}
              disabled={isRefreshing}
              title="새로고침"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              type="button"
              onClick={handleFetchResult}
              disabled={status !== "done" || !jobId}
            >
              결과 불러오기
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
