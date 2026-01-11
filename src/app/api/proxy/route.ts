import { NextResponse } from 'next/server';
import { fetchWithBypass, getBrowserHeaders } from '@/lib/proxy';

/**
 * 🔐 Advanced Proxy API with Cloudflare Bypass
 * Proxies requests with enhanced headers and ad-blocking
 */

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const mode = searchParams.get('mode') || 'html'; // 'html' or 'raw'

    if (!url) {
        return new NextResponse('URL required', { status: 400 });
    }

    console.log(`[API/Proxy] Proxying: ${url}`);

    try {
        // Use advanced bypass for the request
        const response = await fetchWithBypass(url, {
            timeout: 20000,
            referer: new URL(url).origin,
            useCorsProxy: true, // Enable CORS proxy fallback
            useScraperApi: false, // Don't use ScraperAPI for media (too slow)
        });

        // For raw mode (videos, media), just pass through
        if (mode === 'raw') {
            const contentType = response.headers.get('content-type') || 'application/octet-stream';
            const data = await response.arrayBuffer();
            return new NextResponse(data, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 's-maxage=86400, stale-while-revalidate',
                }
            });
        }

        // HTML mode - clean ads and fix URLs
        let html = await response.text();

        // Remove common ad scripts and elements
        const adPatterns = [
            /<script[^>]*(?:ads|advert|analytics|tracking|popup|banner|sponsor)[^>]*>[\s\S]*?<\/script>/gi,
            /<script[^>]*googletag[^>]*>[\s\S]*?<\/script>/gi,
            /<script[^>]*doubleclick[^>]*>[\s\S]*?<\/script>/gi,
            /<script[^>]*adsbygoogle[^>]*>[\s\S]*?<\/script>/gi,
            /<ins[^>]*adsbygoogle[^>]*>[\s\S]*?<\/ins>/gi,
            /<div[^>]*(?:ad-container|ad-wrapper|ad-banner|popup-overlay)[^>]*>[\s\S]*?<\/div>/gi,
            /<iframe[^>]*(?:ads|banner|pop)[^>]*>[\s\S]*?<\/iframe>/gi,
            /onclick\s*=\s*["'][^"']*(?:window\.open|popup)[^"']*["']/gi,
            /<a[^>]*target\s*=\s*["']_blank["'][^>]*>[\s\S]*?<\/a>/gi, // Remove external links
        ];

        for (const pattern of adPatterns) {
            html = html.replace(pattern, '');
        }

        // Inject CSS to hide remaining ad elements
        const adBlockCSS = `
            <style>
                [class*="ad-"], [class*="ads-"], [class*="banner"], 
                [class*="popup"], [class*="overlay"], [id*="ad-"], 
                [id*="ads-"], [id*="popup"], [id*="overlay"],
                .advertisement, .sponsored, .promo,
                iframe:not([src*="player"]):not([src*="embed"]):not([src*="video"]) { 
                    display: none !important; 
                    visibility: hidden !important;
                    height: 0 !important;
                    width: 0 !important;
                }
                body { overflow: auto !important; }
            </style>
        `;
        html = html.replace('</head>', adBlockCSS + '</head>');

        // Fix relative URLs
        const baseUrl = new URL(url).origin;
        html = html.replace(/src="\//g, `src="${baseUrl}/`);
        html = html.replace(/href="\//g, `href="${baseUrl}/`);

        // Allow iframes for video players
        const cspHeader = "frame-ancestors 'self' *; script-src 'self' 'unsafe-inline' 'unsafe-eval' *;";

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 's-maxage=3600, stale-while-revalidate',
                'Content-Security-Policy': cspHeader,
                'X-Frame-Options': 'ALLOWALL',
            }
        });

    } catch (err: any) {
        console.error('[API/Proxy] Error:', err.message);

        // Return a user-friendly fallback page
        const fallbackHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Stream Loading...</title>
    <style>
        body { 
            background: #000; 
            color: #fff; 
            font-family: sans-serif; 
            display: flex; 
            flex-direction: column;
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
        }
        .loader { 
            width: 50px; 
            height: 50px; 
            border: 5px solid #333; 
            border-top: 5px solid #ff5722; 
            border-radius: 50%; 
            animation: spin 1s linear infinite; 
        }
        @keyframes spin { 
            0% { transform: rotate(0deg); } 
            100% { transform: rotate(360deg); } 
        }
        a { color: #ff5722; margin-top: 20px; }
        .error { color: #888; margin-top: 10px; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="loader"></div>
    <p>Stream provider blocked. Opening directly...</p>
    <p class="error">${err.message}</p>
    <a href="${url}" target="_blank" rel="noopener">Open in New Tab →</a>
    <script>
        // Auto-redirect to direct URL after 3 seconds
        setTimeout(() => {
            window.location.href = "${url}";
        }, 3000);
    </script>
</body>
</html>
        `;

        return new NextResponse(fallbackHtml, {
            headers: {
                'Content-Type': 'text/html',
            }
        });
    }
}
