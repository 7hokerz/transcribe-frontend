import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
];

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {

  poweredByHeader: false,
  compress: true,
  
  async headers() {
    return [
      // SW는 항상 즉시 최신화 (PWA 핵심)
      {
        source: '/sw.js',
        headers: [
          ...securityHeaders,
          { 
            key: 'Cache-Control', 
            value: 'public, max-age=0, must-revalidate',
          },
          { 
            key: 'Service-Worker-Allowed', 
            value: '/' 
          },
        ],
      },

      // Next 정적 파일 (_next/static)
      {
        source: '/_next/static/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: isDev
              ? 'no-cache, no-store, must-revalidate'
              : 'public, max-age=31536000, immutable',
          },
        ],
      },

      // Next.js 이미지 최적화 결과 (자동 해시 포함)
      {
        source: '/_next/image/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: isDev
              ? 'no-cache'
              : 'public, max-age=31536000, immutable',
          },
        ],
      },

      // traffic-advice
      {
        source: '/.well-known/traffic-advice',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: isDev
              ? 'no-cache, no-store, must-revalidate'
              : 'public, max-age=3600, must-revalidate',
          },
        ],
      },

      // PWA manifest
      {
        source: '/icons/site.webmanifest',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: isDev
              ? 'no-cache, no-store, must-revalidate'
              : 'public, max-age=3600, must-revalidate',
          },
        ],
      },

      // icons 폴더의 이미지들
      {
        source: '/icons/:path*.(png|jpg|jpeg|svg|ico|webp)',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: isDev
              ? 'no-cache'
              : 'public, max-age=86400, must-revalidate', // 1일
          },
        ],
      },

      // image 폴더의 이미지들
      {
        source: '/image/:path*.(png|jpg|jpeg|svg|ico|webp)',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: isDev
              ? 'no-cache'
              : 'public, max-age=86400, must-revalidate', // 1일
          },
        ],
      },

      // SEO 관련 파일 - 주기적으로 업데이트 가능
      {
        source: '/:path(robots.txt|sitemap.xml)',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, must-revalidate',
          },
        ],
      },

      // API 라우트 - 동적 데이터이므로 캐시 금지
      {
        source: '/api/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        ],
      },

      // 모든 라우트 공통 보안 헤더
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig;
