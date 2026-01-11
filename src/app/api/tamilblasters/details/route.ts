import { NextResponse } from 'next/server';
import { fetchHtmlWithBypass } from '@/lib/proxy';
import { getDomain } from '@/lib/config';

/**
 * 🚀 ADVANCED 1TamilBlasters Details Scraper with Cloudflare Bypass
 * Uses multi-layer bypass for magnet extraction
 */

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
    }

    console.log(`[API/TamilBlasters/Details] Fetching with bypass: ${targetUrl}`);

    try {
        const domain = await getDomain('1tamilblasters');
        // Use advanced bypass to fetch the details page
        const html = await fetchHtmlWithBypass(targetUrl, domain);

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
                if (!src.includes('googlead') && !src.includes('facebook') && !src.includes('twitter')) {
                    watch = src;
                    break;
                }
            }
        }

        console.log(`[API/TamilBlasters/Details] Found ${uniqueMagnets.length} magnets (via bypass)`);

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
