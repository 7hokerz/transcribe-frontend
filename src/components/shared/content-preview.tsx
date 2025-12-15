"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentPreviewProps {
  /**
   * 미리보기 섹션의 제목
   * @example "변환된 텍스트 (미리보기)", "추출된 텍스트 (미리보기)"
   */
  title?: string;

  /**
   * 표시할 콘텐츠 내용
   */
  content: string;

  /**
   * 콘텐츠가 없을 때 표시할 placeholder
   */
  placeholder?: string;

  /**
   * 처리 중 상태 여부
   */
  isProcessing?: boolean;

  /**
   * 처리 중일 때 표시할 텍스트
   */
  processingText?: string;

  /**
   * Textarea의 높이 클래스
   * @default "h-40"
   */
  textareaHeight?: string;

  /**
   * 추가 className
   */
  className?: string;

  /**
   * 기본 열림 상태
   * @default false
   */
  defaultOpen?: boolean;
}

/**
 * 콘텐츠 미리보기 공통 컴포넌트
 *
 * 모든 quiz-form에서 사용되는 접을 수 있는 텍스트 미리보기 영역
 */
export function ContentPreview({
  title = "콘텐츠 미리보기",
  content,
  placeholder = "콘텐츠가 여기에 표시됩니다.",
  isProcessing = false,
  processingText = "콘텐츠를 처리하는 중입니다...",
  textareaHeight = "h-40",
  className,
  defaultOpen = false,
}: ContentPreviewProps) {
  return (
    <Collapsible className={cn("mt-6", className)} defaultOpen={defaultOpen}>
      <div className="flex items-center justify-between rounded-md border px-4 py-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-9 p-0">
            <ChevronsUpDown className="h-4 w-4" />
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2">
        <Textarea
          readOnly
          placeholder={isProcessing ? processingText : placeholder}
          className={cn(textareaHeight, "bg-muted/50")}
          value={content}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
