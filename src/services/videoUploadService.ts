import { generateUploadSignedUrlForSourceVideo } from "@/actions/transcribeActions";
import { uploadSingleChunk } from "./audioUploadService";

/** 원본 비디오 통째로 업로드 */
export async function uploadSourceVideo(
  file: File,
  userId: string,
  onProgress: (progress: number) => void
): Promise<string> {
  const res = await generateUploadSignedUrlForSourceVideo({
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size
  }, userId);

  if (!res.success || !res.signedUrl || !res.sessionId) {
    throw new Error(res.message || "비디오 업로드 준비 실패");
  }

  // chunkName 대신 'source' 등으로 로깅 및 트래킹
  await uploadSingleChunk(
    file,
    res.signedUrl,
    "source_file", 
    (_, progress) => onProgress(progress)
  );

  return res.sessionId;
}