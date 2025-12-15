"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Settings } from "lucide-react";

interface TranscriptionPromptDialogProps {
  /**
   * 현재 저장된 음성 변환 지시사항
   */
  value: string;

  /**
   * 지시사항이 변경될 때 호출되는 핸들러
   */
  onChange: (value: string) => void;

  /**
   * 최대 글자 수
   * @default 220
   */
  maxLength?: number;
}

/**
 * 음성 변환 지시사항 설정 Dialog 컴포넌트
 *
 * 동영상 업로드 시 음성 변환의 정확성을 높이기 위한
 * 추가 정보(키워드, 용어 등)를 입력받습니다.
 *
 * @example
 * ```tsx
 * const [prompt, setPrompt] = useState("");
 *
 * <TranscriptionPromptDialog
 *   value={prompt}
 *   onChange={setPrompt}
 * />
 * ```
 */
export function TranscriptionPromptDialog({
  value,
  onChange,
  maxLength = 220,
}: TranscriptionPromptDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempValue, setTempValue] = useState("");

  const handleOpen = () => {
    setTempValue(value);
    setIsOpen(true);
  };

  const handleCancel = () => {
    setTempValue("");
    setIsOpen(false);
  };

  const handleSave = () => {
    onChange(tempValue);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={handleOpen}
        >
          <Settings className="h-4 w-4" />
          <span className="text-xs">음성 변환 지시사항 (선택)</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>음성 변환 지시사항 설정</DialogTitle>
          <DialogDescription>
            음성 변환의 정확성을 높이는 데 도움이 될 수 있는 정보를 입력하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Textarea
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            placeholder="예: AI, 인공지능, GPT, RAG..."
            className="min-h-[120px]"
            maxLength={maxLength}
          />
          <div className="text-xs text-muted-foreground text-right">
            {tempValue.length}/{maxLength}자
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            취소
          </Button>
          <Button type="button" onClick={handleSave}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
