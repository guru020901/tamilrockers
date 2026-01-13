import { NextResponse } from 'next/server';
import { USER_AGENT } from '@/lib/config';

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
    const cookie = searchParams.get('cookie'); // Read cookie

    if (!targetUrl) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    console.log(`[API/Relay] Proxying: ${targetUrl.substring(0, 80)}...`);

    try {
        const headers: Record<string, string> = {
            'User-Agent': USER_AGENT, // Use standard UA
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

        // CRITICAL: Add cookie if provided (enables authenticated streaming)
        if (cookie) {
            headers['Cookie'] = cookie;
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

        // Check if content is M3U8 playlist
        const contentType = response.headers.get('content-type') || '';
        const isM3u8 = contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.includes('.m3u8');

        // M3U8 REWRITING LOGIC
        if (isM3u8) {
            const text = await response.text();
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

            // Rewrite line by line
            const rewritten = text.split('\n').map(line => {
                const l = line.trim();
                if (!l || l.startsWith('#')) return line; // Pass comments/tags unchanged

                // Resolve absolute URL
                let absoluteUrl = l;
                if (!l.startsWith('http')) {
                    absoluteUrl = new URL(l, baseUrl).toString();
                }

                // Wrap in relay
                const encodedUrl = encodeURIComponent(absoluteUrl);
                const encodedReferer = referer ? encodeURIComponent(referer) : '';
                const encodedCookie = cookie ? encodeURIComponent(cookie) : '';
                return `/api/relay?url=${encodedUrl}&referer=${encodedReferer}&cookie=${encodedCookie}`;
            }).join('\n');

            return new NextResponse(rewritten, {
                status: 200,
                headers: {
                    'Content-Type': 'application/vnd.apple.mpegurl',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache, no-store, must-revalidate', // M3U8 shouldn't be cached aggressively
                }
            });
        }

        // STANDARD STREAMING (MP4/TS segments)
        const contentLength = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range');
        const responseHeaders: HeadersInit = {
            'Content-Type': contentType || 'application/octet-stream', // Use the already defined contentType
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Cache-Control': 'public, max-age=3600',
            'X-Relay': 'nodejs',
        };

        if (contentLength) responseHeaders['Content-Length'] = contentLength;
        if (contentRange) responseHeaders['Content-Range'] = contentRange;

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

