
import { SignedPostPolicyV4Output } from '@google-cloud/storage';

/**
 * 개별 오디오 청크를 Firebase Storage에 업로드 (XHR 기반)
 */
export async function uploadSingleChunk(
  chunkFile: File,
  signedUrl: SignedPostPolicyV4Output,
  chunkName: string,
  onProgress: (chunkName: string, progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();

    for (const key in signedUrl.fields) {
      formData.append(key, signedUrl.fields[key]);
    }
    formData.append('file', chunkFile);

    const xhr = new XMLHttpRequest();
    xhr.timeout = 300_000;

    const handleProgress = (event: ProgressEvent) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(chunkName, progress);
      }
    };

    const handleLoad = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(chunkName, 100);
        resolve();
      } else {
        reject(new Error(`업로드 실패: ${xhr.statusText}`));
      }
    };

    const handleError = () => {
      cleanup();
      reject(new Error('네트워크 오류가 발생했습니다.'));
    };

    const handleAbort = () => {
      cleanup();
      reject(new Error('업로드가 취소되었습니다.'));
    };

    // 이벤트 리스너 정리 함수 (메모리 누수 방지)
    const cleanup = () => {
      xhr.upload.removeEventListener('progress', handleProgress);
      xhr.removeEventListener('load', handleLoad);
      xhr.removeEventListener('error', handleError);
      xhr.removeEventListener('abort', handleAbort);
    };

    xhr.upload.addEventListener('progress', handleProgress);
    xhr.addEventListener('load', handleLoad);
    xhr.addEventListener('error', handleError);
    xhr.addEventListener('abort', handleAbort);

    xhr.open('POST', signedUrl.url);
    xhr.send(formData);
  });
}
