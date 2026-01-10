import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();

    try {
        // Determine backend URL (Server-side call)
        // In Docker/Production, this is localhost:3008
        const backendUrl = `http://localhost:3008/search?${queryString}`;

        const res = await fetch(backendUrl);
        const data = await res.json();

        return NextResponse.json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 });
    }
}
