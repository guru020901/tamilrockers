import { NextResponse } from 'next/server';
import movies from '@/data/movies.json';

export async function GET() {
    // In a real scenario, this would scrape live data.
    // For now, we serve the "cached" seed data.
    return NextResponse.json(movies);
}
