import { NextResponse } from 'next/server';
import { fetchHtmlWithBypass } from '@/lib/proxy';

/**
 * 🕵️‍♂️ STREAM EXTRACTOR API
 * Extracts direct video links (.m3u8, .mp4) from hosting pages
 * Bypasses ads by getting the raw stream URL
 */

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    // console.log(`[API/Extract] Extracting stream from: ${url}`);

    try {
        const html = await fetchHtmlWithBypass(url, new URL(url).origin);

        let streamUrl = null;
        let type = 'mp4';

        // 1. Guxhag / Hglink / HQtier (Generic HLS Finder)
        // Look for typical m3u8 patterns in scripts
        const hlsPatterns = [
            /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /source\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /["']([^"']+\.m3u8[^"']*)["']/i, // Aggressive fallback
        ];

        for (const pattern of hlsPatterns) {
            const match = pattern.exec(html);
            if (match) {
                streamUrl = match[1];
                type = 'hls';
                // Clean up URL if needed (sometimes slashes are escaped)
                streamUrl = streamUrl.replace(/\\\//g, '/');
                break;
            }
        }

        // 2. Generic MP4 Finder (if HLS not found)
        if (!streamUrl) {
            const mp4Patterns = [
                /file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
                /source\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
                /src\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
            ];

            for (const pattern of mp4Patterns) {
                const match = pattern.exec(html);
                if (match) {
                    streamUrl = match[1];
                    type = 'mp4';
                    streamUrl = streamUrl.replace(/\\\//g, '/');
                    break;
                }
            }
        }

        if (streamUrl) {
            console.log(`[API/Extract] Success: ${streamUrl.substring(0, 50)}...`);
            return NextResponse.json({
                success: true,
                streamUrl,
                type,
                headers: {
                    // Pass headers needed for playback (often Referer/Origin is required)
                    Referer: url,
                }
            });
        }

        console.log(`[API/Extract] Failed to find stream in: ${url}`);
        return NextResponse.json({ success: false, error: 'No stream found' }, { status: 404 });

    } catch (err: any) {
        console.error(`[API/Extract] Error: ${err.message}`);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
