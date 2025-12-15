"use client";

import { forwardRef, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadButtonProps {
  /**
   * 파일 input의 id
   */
  id: string;

  /**
   * 파일 선택 시 호출되는 핸들러
   */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;

  /**
   * 로딩 상태 (업로드/파싱 중)
   */
  isLoading?: boolean;

  /**
   * 버튼 비활성화 상태
   */
  disabled?: boolean;

  /**
   * 허용할 파일 타입 (accept 속성)
   * @example "video/*", ".pdf", "image/png,.jpg,.jpeg"
   */
  accept?: string;

  /**
   * 다중 파일 선택 허용
   * @default false
   */
  multiple?: boolean;

  /**
   * 로딩 중이 아닐 때 표시할 아이콘
   */
  icon?: ReactNode;

  /**
   * 파일이 선택되지 않았을 때 버튼 텍스트
   */
  defaultText: string;

  /**
   * 파일이 이미 선택되었을 때 버튼 텍스트
   */
  selectedText?: string;

  /**
   * 파일이 선택되었는지 여부
   */
  hasFile?: boolean;

  /**
   * 선택된 파일명 (표시용)
   */
  selectedFileName?: string;

  /**
   * 업로드 진행률 (0-100)
   */
  uploadProgress?: number;

  /**
   * 추가 className
   */
  className?: string;
}

/**
 * 파일 업로드 버튼 공통 컴포넌트
 *
 * hidden input + 클릭 가능한 버튼을 조합하여
 * 일관된 파일 업로드 UX를 제공합니다.
 *
 * @example
 * ```tsx
 * const fileInputRef = useRef<HTMLInputElement>(null);
 *
 * <FileUploadButton
 *   ref={fileInputRef}
 *   id="video-upload"
 *   accept="video/*"
 *   onChange={handleFileChange}
 *   isLoading={isParsing}
 *   icon={<Video className="mr-2 h-4 w-4" />}
 *   defaultText="비디오 파일 선택"
 *   selectedText="다른 비디오 파일 선택"
 *   hasFile={!!selectedFileName}
 *   selectedFileName={selectedFileName}
 *   uploadProgress={uploadProgress}
 * />
 * ```
 */
export const FileUploadButton = forwardRef<HTMLInputElement, FileUploadButtonProps>(
  (
    {
      id,
      onChange,
      isLoading = false,
      disabled = false,
      accept,
      multiple = false,
      icon,
      defaultText,
      selectedText,
      hasFile = false,
      selectedFileName,
      uploadProgress,
      className,
    },
    ref
  ) => {
    return (
      <div className={cn("space-y-4", className)}>
        <Input
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          ref={ref}
          onChange={onChange}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const input = document.getElementById(id) as HTMLInputElement;
            input?.click();
          }}
          disabled={isLoading || disabled}
          className="w-full"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            icon
          )}
          {hasFile && selectedText ? selectedText : defaultText}
        </Button>

        {/* 선택된 파일명 표시 */}
        {selectedFileName && !isLoading && (
          <div className="text-sm text-muted-foreground">
            선택된 파일: {selectedFileName}
          </div>
        )}

        {/* 업로드 진행률 표시 */}
        {uploadProgress !== undefined && uploadProgress > 0 && isLoading && (
          <div className="text-sm text-muted-foreground">
            업로드 진행률: {uploadProgress}%
          </div>
        )}
      </div>
    );
  }
);

FileUploadButton.displayName = "FileUploadButton";
