import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    try {
        // Use BACKEND_TORRENTS_URL env var for production (Render.com), fallback to localhost for local dev
        const backendBase = process.env.BACKEND_TORRENTS_URL || 'http://localhost:3008';
        const backendUrl = `${backendBase}/search?${queryString}`;

        console.log(`[API/torrents] Fetching: ${backendUrl}`);

        const res = await fetch(backendUrl, {
            headers: { 'Accept': 'application/json' },
            // Increased timeout for Render's free tier (Puppeteer is slow)
            signal: AbortSignal.timeout(90000)
        });
        const data = await res.json();

        return NextResponse.json(data);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Proxy Error:', errorMessage);
        return NextResponse.json({ error: 'Backend timeout - try again', results: [] }, { status: 504 });
    }
}

