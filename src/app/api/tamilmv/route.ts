import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const domain = searchParams.get('domain');

    if (!query) {
        return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    try {
        // Determine backend URL (Server-side call)
        // In Docker/Production, this is localhost:3007
        const backendUrl = `http://localhost:3007/api/search?q=${encodeURIComponent(query)}&domain=${encodeURIComponent(domain || '')}`;

        const res = await fetch(backendUrl);
        const data = await res.json();

        return NextResponse.json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
    }
}
