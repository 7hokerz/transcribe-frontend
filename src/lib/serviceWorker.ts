
let registrationPromise: Promise<ServiceWorkerRegistration | undefined> | null = null;

function registerServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  // 이미 등록 중이거나 등록 완료된 경우 기존 Promise 반환
  if (registrationPromise) {
    return registrationPromise;
  }

  // ServiceWorker API 미지원
  if (!('serviceWorker' in navigator)) {
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ ServiceWorker not supported');
    }
    return Promise.resolve(undefined);
  }

  // 새로 등록
  registrationPromise = navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ SW registered:', registration);
      }

      // 업데이트 확인
      if (navigator.serviceWorker.controller) {
        registration.update().catch((error) => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ SW update check failed:', error);
          }
        });
      }

      return registration;
    })
    .catch((error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('🔥 SW registration failed:', error);
      }
      // 실패 시 다음에 다시 시도할 수 있도록 초기화
      registrationPromise = null;
      return undefined;
    });

  return registrationPromise;
}

export { registerServiceWorker };
