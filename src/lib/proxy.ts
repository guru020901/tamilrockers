/**
 * 🔐 Advanced Proxy & Cloudflare Bypass Utility
 * Multi-layer approach: Enhanced headers → CORS proxies → ScraperAPI
 */

// Rotating User-Agent pool (Chrome-like)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

// Free CORS Proxy endpoints
const CORS_PROXIES = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

/**
 * Get enhanced browser-like headers
 */
export function getBrowserHeaders(referer?: string): Record<string, string> {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const isChrome = ua.includes('Chrome');

    const headers: Record<string, string> = {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive',
    };

    // Add Chrome Client Hints (helps bypass some Cloudflare checks)
    if (isChrome) {
        headers['Sec-CH-UA'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
        headers['Sec-CH-UA-Mobile'] = '?0';
        headers['Sec-CH-UA-Platform'] = '"Windows"';
        headers['Sec-Fetch-Dest'] = 'document';
        headers['Sec-Fetch-Mode'] = 'navigate';
        headers['Sec-Fetch-Site'] = referer ? 'same-origin' : 'none';
        headers['Sec-Fetch-User'] = '?1';
    }

    if (referer) {
        headers['Referer'] = referer;
        headers['Origin'] = new URL(referer).origin;
    }

    return headers;
}

/**
 * Fetch with Cloudflare bypass - uses multiple strategies
 */
export async function fetchWithBypass(url: string, options: {
    timeout?: number;
    referer?: string;
    useCorsProxy?: boolean;
    useScraperApi?: boolean;
} = {}): Promise<Response> {
    const { timeout = 15000, referer, useCorsProxy = true, useScraperApi = true } = options;

    // Strategy 1: Direct fetch with enhanced headers
    try {
        console.log(`[Proxy] Trying direct fetch: ${url}`);
        const response = await fetch(url, {
            headers: getBrowserHeaders(referer),
            signal: AbortSignal.timeout(timeout),
        });

        if (response.ok) {
            console.log(`[Proxy] Direct fetch SUCCESS`);
            return response;
        }

        // If 403/503, Cloudflare is blocking - try other methods
        if (response.status !== 403 && response.status !== 503) {
            return response; // Return non-Cloudflare errors as-is
        }

        console.log(`[Proxy] Direct fetch blocked (${response.status}), trying proxies...`);
    } catch (err: any) {
        console.log(`[Proxy] Direct fetch failed: ${err.message}`);
    }

    // Strategy 2: ScraperAPI (if API key provided)
    const scraperApiKey = process.env.SCRAPER_API_KEY;
    if (useScraperApi && scraperApiKey) {
        try {
            console.log(`[Proxy] Trying ScraperAPI...`);
            const scraperUrl = `https://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(url)}`;
            const response = await fetch(scraperUrl, {
                signal: AbortSignal.timeout(timeout + 5000), // ScraperAPI needs more time
            });

            if (response.ok) {
                console.log(`[Proxy] ScraperAPI SUCCESS`);
                return response;
            }
        } catch (err: any) {
            console.log(`[Proxy] ScraperAPI failed: ${err.message}`);
        }
    }

    // Strategy 3: CORS Proxy rotation
    if (useCorsProxy) {
        for (let i = 0; i < CORS_PROXIES.length; i++) {
            try {
                const proxyFn = CORS_PROXIES[i];
                const proxyUrl = proxyFn(url);
                console.log(`[Proxy] Trying CORS proxy ${i + 1}/${CORS_PROXIES.length}...`);

                const response = await fetch(proxyUrl, {
                    headers: {
                        'User-Agent': USER_AGENTS[0],
                        'Accept': '*/*',
                    },
                    signal: AbortSignal.timeout(timeout),
                });

                if (response.ok) {
                    console.log(`[Proxy] CORS proxy ${i + 1} SUCCESS`);
                    return response;
                }
            } catch (err: any) {
                console.log(`[Proxy] CORS proxy ${i + 1} failed: ${err.message}`);
            }
        }
    }

    // All strategies failed
    throw new Error('All bypass methods failed. Site may have strong protection.');
}

/**
 * Fetch HTML content with automatic retry on Cloudflare blocks
 */
export async function fetchHtmlWithBypass(url: string, referer?: string): Promise<string> {
    const response = await fetchWithBypass(url, { referer, timeout: 20000 });
    return await response.text();
}
