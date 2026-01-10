import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    try {
        // Use BACKEND_TORRENTS_URL env var for production (Render.com), fallback to localhost for local dev
        const backendBase = process.env.BACKEND_TORRENTS_URL || 'http://localhost:3008';
        const backendUrl = `${backendBase}/search?${queryString}`;

        const res = await fetch(backendUrl, {
            headers: { 'Accept': 'application/json' },
            // Add timeout for production
            signal: AbortSignal.timeout(30000)
        });
        const data = await res.json();

        return NextResponse.json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
    }
}
