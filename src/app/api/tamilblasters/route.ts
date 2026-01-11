import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    try {
        const backendBase = 'http://localhost:3009'; // Dedicated TamilBlasters MCP
        const backendUrl = `${backendBase}/search?q=${encodeURIComponent(query)}`;

        console.log(`[API/tamilblasters] Fetching: ${backendUrl}`);

        const res = await fetch(backendUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(90000) // 90s timeout
        });

        if (!res.ok) {
            throw new Error(`Backend Status: ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error('[API/tamilblasters] Proxy Error:', error.message);
        return NextResponse.json({
            error: 'Failed to fetch from TamilBlasters service',
            details: error.message
        }, { status: 500 });
    }
}
