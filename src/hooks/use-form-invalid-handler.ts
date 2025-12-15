import { useCallback } from "react";
import { useToast } from "./use-toast";

interface FormInvalidHandlerOptions {
  title?: string;
  description?: string;
}

export type FormInvalidHandler = () => void;

/**
 * 폼 유효성 검사 실패 시 토스트 메시지를 표시하는 공통 핸들러 훅
 */
export function useFormInvalidHandler(options?: FormInvalidHandlerOptions): FormInvalidHandler {
  const { toast } = useToast();

  return useCallback(() => {
    toast({
      title: options?.title || "입력 오류",
      description: options?.description || "필수 필드를 확인해주세요.",
      variant: "destructive",
    });
  }, [toast, options?.title, options?.description]);
}
