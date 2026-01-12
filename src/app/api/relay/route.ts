import { NextResponse } from 'next/server';

/**
 * 🚀 STREAM RELAY API - Video Proxy
 * 
 * This endpoint acts as a reverse proxy for video streams.
 * It fetches video from the source with proper headers and re-serves it,
 * bypassing CORS restrictions.
 * 
 * Usage: /api/relay?url=<encoded_stream_url>&referer=<referer>
 */

// Use Node.js runtime instead of Edge - better outbound networking
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    const referer = searchParams.get('referer');

    if (!targetUrl) {
        return new NextResponse('Missing URL', { status: 400 });
    }

    console.log(`[API/Relay] Proxying: ${targetUrl.substring(0, 80)}...`);

    try {
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity', // Don't accept gzip for streaming
        };

        // Pass through range header for seeking
        const rangeHeader = request.headers.get('range');
        if (rangeHeader) {
            headers['Range'] = rangeHeader;
        }

        // Add referer if provided
        if (referer) {
            headers['Referer'] = referer;
            try {
                headers['Origin'] = new URL(referer).origin;
            } catch (e) {
                // Invalid referer URL, skip origin
            }
        }

        // Fetch with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(targetUrl, {
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok && response.status !== 206) {
            console.error(`[API/Relay] Upstream returned ${response.status}`);
            return new NextResponse(`Upstream error: ${response.status}`, { status: response.status });
        }

        // Get content info
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const contentLength = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range');

        // Build response headers
        const responseHeaders: HeadersInit = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Cache-Control': 'public, max-age=3600',
            'X-Relay': 'nodejs',
        };

        if (contentLength) responseHeaders['Content-Length'] = contentLength;
        if (contentRange) responseHeaders['Content-Range'] = contentRange;

        // Stream the response
        return new NextResponse(response.body, {
            status: response.status,
            headers: responseHeaders,
        });

    } catch (e: any) {
        console.error(`[API/Relay] Error: ${e.message}`);

        if (e.name === 'AbortError') {
            return new NextResponse('Relay timeout', { status: 504 });
        }

        return new NextResponse(`Relay Error: ${e.message}`, { status: 502 });
    }
}

// Handle preflight CORS requests
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
            'Access-Control-Max-Age': '86400',
        },
    });
}

