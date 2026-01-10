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
