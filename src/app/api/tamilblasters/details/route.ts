import { NextResponse } from 'next/server';

/**
 * PUPPETEER-FREE 1TamilBlasters Details Scraper
 * Uses fetch + regex parsing (works on Vercel serverless!)
 */

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
    }

    console.log(`[API/TamilBlasters/Details] Fetching: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        // Extract magnet links using regex
        const magnets: any[] = [];
        const magnetPattern = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>)]*/gi;

        let match;
        while ((match = magnetPattern.exec(html)) !== null) {
            const magnet = match[0];
            // Try to extract title from magnet
            const dnMatch = magnet.match(/dn=([^&]+)/);
            const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';

            magnets.push({
                link: magnet,
                title,
            });
        }

        // Deduplicate magnets
        const seen = new Set();
        const uniqueMagnets = magnets.filter(m => {
            if (seen.has(m.link)) return false;
            seen.add(m.link);
            return true;
        });

        // Extract poster image
        let poster = null;
        const posterPatterns = [
            /<img[^>]*class="[^"]*attachment-post-thumbnail[^"]*"[^>]*src="([^"]+)"/i,
            /<img[^>]*src="([^"]+)"[^>]*class="[^"]*wp-post-image[^"]*"/i,
            /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
            /<img[^>]*src="(https?:\/\/[^"]+(?:poster|cover|thumb)[^"]+)"/i,
        ];

        for (const pattern of posterPatterns) {
            const posterMatch = pattern.exec(html);
            if (posterMatch) {
                poster = posterMatch[1];
                break;
            }
        }

        // Extract embedded video/iframe URL (for native player)
        let watch = null;
        const iframePatterns = [
            /<iframe[^>]*src="([^"]+(?:cybervynx|dood|streamtape|embed|player)[^"]+)"/i,
            /<iframe[^>]*src="(https?:\/\/[^"]+)"/i,
        ];

        for (const pattern of iframePatterns) {
            const iframeMatch = pattern.exec(html);
            if (iframeMatch) {
                const src = iframeMatch[1];
                // Skip ads and non-video iframes
                if (!src.includes('googlead') && !src.includes('facebook') && !src.includes('twitter')) {
                    watch = src;
                    break;
                }
            }
        }

        console.log(`[API/TamilBlasters/Details] Found ${uniqueMagnets.length} magnets, poster: ${!!poster}, watch: ${!!watch}`);

        return NextResponse.json({
            success: true,
            data: {
                magnets: uniqueMagnets,
                poster,
                watch,
            }
        });

    } catch (err: any) {
        console.error('[API/TamilBlasters/Details] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
