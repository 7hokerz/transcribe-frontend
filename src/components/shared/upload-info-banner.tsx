"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadInfoBannerProps {
  /**
   * 정보 배너에 표시할 내용
   * 문자열 배열 또는 커스텀 ReactNode
   */
  info: string[] | ReactNode;

  /**
   * 추가 className
   */
  className?: string;

  /**
   * 기본 열림 상태
   * @default false
   */
  defaultOpen?: boolean;

  /**
   * 토글 버튼 텍스트
   * @default "업로드 제한"
   */
  toggleText?: string;
}

/**
 * 업로드 제한 정보를 표시하는 토글 가능한 배너 컴포넌트
 *
 * 파일 업로드 섹션에서 사용되며, 허용 확장자, 파일 크기 등의 제한 사항을 표시합니다.
 *
 * @example
 * ```tsx
 * <UploadInfoBanner info={["최대 파일 크기: 10MB"]} />
 * ```
 *
 * 반환값:
 * - button: 토글 버튼 (헤더에 배치)
 * - banner: 정보 배너 (조건부 렌더링)
 */
export function UploadInfoBanner({
  info,
  className,
  defaultOpen = false,
  toggleText = "업로드 제한",
}: UploadInfoBannerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setIsOpen(!isOpen)}
      className="h-8 gap-1.5"
    >
      <Info className="h-4 w-4" />
      <span className="text-xs">{toggleText}</span>
    </Button>
  );

  const banner = isOpen && (
    <div className={cn("text-sm text-muted-foreground bg-muted/50 p-3 rounded-md", className)}>
      {Array.isArray(info) ? (
        <div className="space-y-1">
          {info.map((item, index) => (
            <div key={index}>• {item}</div>
          ))}
        </div>
      ) : (
        info
      )}
    </div>
  );

  return { button, banner };
}
