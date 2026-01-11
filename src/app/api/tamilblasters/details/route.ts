import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    try {
        const backendBase = 'http://localhost:3009'; // TamilBlasters MCP
        const backendUrl = `${backendBase}/details?url=${encodeURIComponent(url)}`;

        console.log(`[API/tamilblasters/details] Fetching: ${backendUrl}`);

        const res = await fetch(backendUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(90000)
        });

        if (!res.ok) {
            throw new Error(`Backend Status: ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error('[API/tamilblasters/details] Error:', error.message);
        return NextResponse.json({
            error: 'Failed to fetch details',
            details: error.message
        }, { status: 500 });
    }
}
