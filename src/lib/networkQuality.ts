
type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface NetworkConfig {
    quality: NetworkQuality;
    effectiveType?: string;
    downlink?: number;      // Mbps
    rtt?: number;           // ms (지연 시간)
    saveData?: boolean;     // (데이터 절약 모드)
    maxConcurrency: number;
}

export function detectNetworkConfig(): NetworkConfig {
    if (typeof navigator === "undefined") {
        // SSR 등에서는 기본값
        return {
            quality: "good",
            maxConcurrency: 2,
        };
    }

    // @ts-ignore - Network Information API
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) {
        // Network Information API 미지원 브라우저 기본값
        return {
            quality: "good",
            maxConcurrency: 2,
        };
    }

    const {
        effectiveType,
        downlink,
        rtt,
        saveData,
    }: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
        saveData?: boolean;
    } = connection;

    const quality = mapToQuality({ effectiveType, downlink, rtt });

    let maxConcurrency = getMaxConcurrency(quality);

    if (saveData) {
        maxConcurrency = Math.min(maxConcurrency, 1);
    }

    return {
        quality,
        effectiveType,
        downlink,
        rtt,
        saveData,
        maxConcurrency,
    };
}

function mapToQuality({
    effectiveType,
    downlink,
    rtt,
}: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
}): NetworkQuality {
    if (effectiveType) {
        if (effectiveType === "4g") return "excellent";
        if (effectiveType === "3g") return "good";
        if (effectiveType === "2g") return "fair";
        return "poor";
    }

    // effectiveType이 없는 경우 downlink / rtt 기반 대략적인 fallback
    if (typeof downlink === "number") {
        if (downlink >= 10) return "excellent";
        if (downlink >= 3) return "good";
        if (downlink >= 1) return "fair";
        return "poor";
    }

    if (typeof rtt === "number") {
        if (rtt < 100) return "excellent";
        if (rtt < 200) return "good";
        if (rtt < 500) return "fair";
        return "poor";
    }

    return "good";
}

function getMaxConcurrency(quality: NetworkQuality): number {
    switch (quality) {
        case 'excellent': return 3;  // 4G
        case 'good': return 2;       // 3G
        case 'fair': return 1;       // 2G
        case 'poor': return 1;       // 2G
    }
}
