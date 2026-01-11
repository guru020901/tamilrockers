import { NextResponse } from 'next/server';

/**
 * PUPPETEER-FREE 1TamilMV Details Scraper
 * Uses fetch + regex parsing (works on Vercel serverless!)
 */

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
    }

    console.log(`[API/TamilMV/Details] Fetching: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': new URL(targetUrl).origin,
            },
            signal: AbortSignal.timeout(20000),
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

        // Extract poster/thumbnail image
        let poster = null;
        const posterPatterns = [
            /<img[^>]*class="[^"]*ipsImage[^"]*"[^>]*src="([^"]+)"/i,
            /<img[^>]*src="([^"]+)"[^>]*class="[^"]*ipsImage[^"]*"/i,
            /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
            /<img[^>]*data-src="([^"]+poster[^"]+)"/i,
            /<img[^>]*src="(https?:\/\/[^"]+(?:jpg|jpeg|png|webp)[^"]*)"/i,
        ];

        for (const pattern of posterPatterns) {
            const posterMatch = pattern.exec(html);
            if (posterMatch && !posterMatch[1].includes('avatar') && !posterMatch[1].includes('emoji')) {
                poster = posterMatch[1];
                break;
            }
        }

        // Try to extract IMDB ID from page content
        let imdbId = null;
        const imdbPatterns = [
            /imdb\.com\/title\/(tt\d+)/i,
            /IMDb[:\s]+([a-zA-Z]*\d+)/i,
            /(tt\d{7,})/i,
        ];

        for (const pattern of imdbPatterns) {
            const imdbMatch = pattern.exec(html);
            if (imdbMatch) {
                imdbId = imdbMatch[1];
                break;
            }
        }

        // Extract embedded video (for native player if available)
        let watch = null;
        const iframePattern = /<iframe[^>]*src="([^"]+)"/gi;
        while ((match = iframePattern.exec(html)) !== null) {
            const src = match[1];
            if (src.includes('player') || src.includes('embed') || src.includes('stream')) {
                watch = src;
                break;
            }
        }

        console.log(`[API/TamilMV/Details] Found ${uniqueMagnets.length} magnets, poster: ${!!poster}, imdb: ${imdbId}`);

        return NextResponse.json({
            success: true,
            data: {
                magnets: uniqueMagnets,
                poster,
                imdbId,
                watch,
            }
        });

    } catch (err: any) {
        console.error('[API/TamilMV/Details] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
