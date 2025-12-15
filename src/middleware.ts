import { NextResponse, type NextRequest } from 'next/server';
import { Address4 } from 'ip-address';
import { blockedRanges } from './lib/blockedRanges';

export async function middleware(req: NextRequest) {
  const clientIpStr = (req.headers.get('x-forwarded-for') || '').split(',').shift()?.trim();

  if (clientIpStr) {
    const response = checkIp(clientIpStr);
    if (response) return response;
  }

  return setCspHeader(req);
}

function checkIp(clientIpStr: string) {
  let clientIp;
  console.log(`접속 IP: ${clientIpStr}`);
  if (Address4.isValid(clientIpStr)) {
    clientIp = new Address4(clientIpStr);
  }
  if (clientIp) {
    const isBlocked = blockedRanges.some(range => clientIp.isInSubnet(new Address4(range)));
    if (isBlocked) {
      return new Response('Access denied from your region.', { status: 403 });
    }
  }
}

function setCspHeader(req: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  //요청 헤더에 nonce 값 추가
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  let cspHeader = '';
  if (process.env.NODE_ENV === 'development') {
    cspHeader = `
      default-src 'self';
      script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval';
      style-src 'self' 'unsafe-inline';
      img-src 'self' blob: data: 
                https://lh3.googleusercontent.com/;
      font-src 'self';
      connect-src 'self'
                https://quiz-whiz-hqbig.firebaseapp.com/
                https://firestore.googleapis.com/
                https://identitytoolkit.googleapis.com/
                https://firebasestorage.googleapis.com/
                https://content-firebaseappcheck.googleapis.com/
                https://securetoken.googleapis.com/
                https://storage.googleapis.com/quiz-whiz-hqbig/;
      frame-src 'self'
                https://www.google.com/
                https://quiz-whiz-hqbig.firebaseapp.com/
                https://www.youtube.com/;
      child-src 'self';
      manifest-src 'self';
      object-src 'none';
      worker-src 'self';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      upgrade-insecure-requests;`;
    res.headers.set(
      'Content-Security-Policy-report-only',
      cspHeader.replace(/\s{2,}/g, ' ').trim()
    )
  } else {
    cspHeader = `
      default-src 'self';
      script-src 'self' 'nonce-${nonce}' 'strict-dynamic'
                https://www.google.com/recaptcha/
                https://www.gstatic.com/recaptcha/;
      style-src 'self' 'unsafe-inline';
      img-src 'self' blob: data:
                https://lh3.googleusercontent.com/;
      font-src 'self';
      connect-src 'self'
                https://www.google.com/recaptcha/
                https://quiz-whiz-hqbig.firebaseapp.com/
                https://firestore.googleapis.com/
                https://firebasestorage.googleapis.com/
                https://securetoken.googleapis.com/
                https://identitytoolkit.googleapis.com/
                https://content-firebaseappcheck.googleapis.com/
                https://storage.googleapis.com/quiz-whiz-hqbig/;
      frame-src 'self'
                https://www.google.com/
                https://www.google.com/recaptcha/
                https://recaptcha.google.com/
                https://quiz-whiz-hqbig.firebaseapp.com/;
      child-src 'self';
      manifest-src 'self';
      object-src 'none';
      worker-src 'self';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      upgrade-insecure-requests;`;
    res.headers.set(
      'Content-Security-Policy',
      cspHeader.replace(/\s{2,}/g, ' ').trim()
    )
  }

  return res;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|wasm|woff|woff2|ttf|otf|webmanifest)).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};