
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = window.navigator.userAgent;
  const isIosDevice = /iPhone|iPod/.test(ua);

  // iPadOS 13+ 부터는 "Macintosh"로 표시되지만 터치가 가능함
  const isIpad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 0;

  return isIosDevice || isIpad;
}