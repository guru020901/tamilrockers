import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return new NextResponse('URL required', { status: 400 });
    }

    console.log(`[API/Proxy] Proxying: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                // Important: Some sites check Referer
                'Referer': new URL(url).origin
            }
        });

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
                iframe:not([src*="player"]):not([src*="embed"]) { 
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

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 's-maxage=3600, stale-while-revalidate'
            }
        });

    } catch (err: any) {
        console.error('[API/Proxy] Error:', err.message);
        return new NextResponse('Proxy error: ' + err.message, { status: 500 });
    }
}
