import 'server-only';
import { interceptors, Pool } from 'undici';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiUrl) {
    throw new Error('NEXT_PUBLIC_API_URL environment variable is not defined');
}

// 동영상 음성 추출 기능 전용
export const AudioPool = new Pool(apiUrl, {
    connections: 10,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 600_000,
    connectTimeout: 5_000,
    headersTimeout: 300_000,
    bodyTimeout: 300_000,
}).compose(
    interceptors.decompress({
        skipStatusCodes: [204, 205, 304]
    })
);

process.on('SIGTERM', async () => { // 안전하게 연결 종료
    await AudioPool.close();
    process.exit(0);
});