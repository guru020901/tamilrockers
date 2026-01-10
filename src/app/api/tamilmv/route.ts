import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const domain = searchParams.get('domain');

    if (!query) {
        return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    try {
        // Use BACKEND_URL env var for production (Render.com), fallback to localhost for local dev
        const backendBase = process.env.BACKEND_URL || 'http://localhost:3007';
        const backendUrl = `${backendBase}/api/search?q=${encodeURIComponent(query)}&domain=${encodeURIComponent(domain || '')}`;

        console.log(`[API/tamilmv] Fetching: ${backendUrl}`);

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

