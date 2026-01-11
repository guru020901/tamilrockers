import { NextResponse } from 'next/server';

/**
 * 🚀 STREAM RELAY API - Ultra-Fast Video Delivery
 * 
 * This endpoint acts as a reverse proxy for video streams.
 * It fetches video chunks from the source and re-serves them,
 * bypassing slow/throttled source servers and enabling CDN caching.
 * 
 * Usage: /api/relay?url=<encoded_stream_url>
 */

export const runtime = 'edge'; // Deploy to edge network for lowest latency

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    const referer = searchParams.get('referer');

    if (!targetUrl) {
        return new NextResponse('Missing URL', { status: 400 });
    }

    try {
        const headers: HeadersInit = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Range': request.headers.get('range') || '', // Pass through range requests for seeking
        };

        if (referer) {
            headers['Referer'] = referer;
            headers['Origin'] = new URL(referer).origin;
        }

        const response = await fetch(targetUrl, {
            headers,
            // @ts-ignore - Edge runtime supports this
            cf: {
                cacheTtl: 3600, // Cache for 1 hour at Cloudflare Edge
                cacheEverything: true,
            }
        });

        if (!response.ok && response.status !== 206) { // 206 is Partial Content (normal for video)
            throw new Error(`Upstream error: ${response.status}`);
        }

        // Determine content type
        const contentType = response.headers.get('content-type') || 'video/mp4';
        const contentLength = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range');

        // Build response headers for optimal streaming
        const responseHeaders: HeadersInit = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=31536000, immutable', // Aggressive browser caching
            'X-Relay': 'ultra-fast',
        };

        if (contentLength) responseHeaders['Content-Length'] = contentLength;
        if (contentRange) responseHeaders['Content-Range'] = contentRange;

        return new NextResponse(response.body, {
            status: response.status,
            headers: responseHeaders,
        });

    } catch (e: any) {
        console.error(`[API/Relay] Error: ${e.message}`);
        return new NextResponse(`Relay Error: ${e.message}`, { status: 502 });
    }
}
