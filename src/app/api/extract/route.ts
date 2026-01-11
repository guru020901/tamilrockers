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

        // 0. De-obfuscate Packed Scripts (common in video players)
        // Looks for eval(function(p,a,c,k,e,d)...)
        const packedPattern = /eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\)\)\)/;
        const packedMatch = packedPattern.exec(html);

        if (packedMatch) {
            try {
                // Determine the unpack logic (simplified)
                // In a real environment we might need a safer unpacker, 
                // but checking the decoded content often reveals the stream.
                // For now, let's look for stream patterns globally first.
            } catch (e) {
                // ignore
            }
        }

        // 1. Guxhag / Hglink / HQtier (Generic HLS Finder)
        // Look for typical m3u8 patterns including those inside JS strings
        const hlsPatterns = [
            /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /source\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
            /=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
        ];

        for (const pattern of hlsPatterns) {
            const match = pattern.exec(html);
            if (match) {
                streamUrl = match[1];
                type = 'hls';
                break;
            }
        }

        // 1.5 Base64 encoded HLS (common in some players)
        if (!streamUrl) {
            // Look for obvious base64 strings that start with http and end with m3u8
            // aHR0c... => http...
            const base64Pattern = /["']([a-zA-Z0-9+/=]{20,})["']/;
            let b64Match;
            // Iterate over potential base64 strings (simple check)
            const globalB64 = new RegExp(base64Pattern, 'g');
            while ((b64Match = globalB64.exec(html)) !== null) {
                try {
                    const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
                    if (decoded.includes('.m3u8') && decoded.startsWith('http')) {
                        streamUrl = decoded;
                        type = 'hls';
                        break;
                    }
                } catch (e) { continue; }
            }
        }

        // 2. Generic MP4 Finder (if HLS not found)
        if (!streamUrl) {
            const mp4Patterns = [
                /file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
                /source\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
                /src\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
                /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i, // Aggressive
            ];

            for (const pattern of mp4Patterns) {
                const match = pattern.exec(html);
                if (match) {
                    streamUrl = match[1];
                    type = 'mp4';
                    break;
                }
            }
        }

        // URL Cleanup
        if (streamUrl) {
            streamUrl = streamUrl.replace(/\\\//g, '/'); // Fix escaped slashes
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
