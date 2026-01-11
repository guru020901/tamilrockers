// Enable Edge Runtime for ultra-fast cold starts
export const runtime = 'edge';

// Optional: Configure specific regions
export const config = {
    runtime: 'edge',
    regions: ['sin1', 'hnd1', 'iad1'], // Singapore, Tokyo, Virginia (global coverage)
};

import { NextResponse } from 'next/server';
import { searchCache, circuitBreaker } from '@/lib/cache';
import { performanceMonitor, prefetchManager } from '@/lib/advanced';

/**
 * ⚡ EDGE-OPTIMIZED Search Endpoint
 * Runs on Vercel's global edge network for <50ms latency
 */
export async function GET(request: Request) {
    const startTime = Date.now();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const source = searchParams.get('source') || 'all';

    if (!query) {
        return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    // Track popular queries for prefetching
    prefetchManager.trackQuery(query);

    // Cache key
    const cacheKey = `unified:${query}:${source}`;

    // Check cache first
    const cached = searchCache.get(cacheKey);
    if (cached) {
        performanceMonitor.track('search-cached', startTime);
        return NextResponse.json({
            results: cached,
            cached: true,
            latency: Date.now() - startTime
        });
    }

    // For edge runtime, we return aggregate results from other API routes
    // since Edge Runtime has limitations with Puppeteer (needs full Node.js)

    try {
        const results: any[] = [];
        const promises: Promise<any>[] = [];

        // Build parallel requests to Node.js APIs
        const baseUrl = new URL(request.url).origin;

        if (source === 'all' || source === '1tamilmv') {
            promises.push(
                fetch(`${baseUrl}/api/tamilmv?q=${encodeURIComponent(query)}`)
                    .then(r => r.json())
                    .then(data => data.results || [])
                    .catch(() => [])
            );
        }

        if (source === 'all' || source === '1tamilblasters') {
            promises.push(
                fetch(`${baseUrl}/api/tamilblasters?q=${encodeURIComponent(query)}`)
                    .then(r => r.json())
                    .then(data => data.results || [])
                    .catch(() => [])
            );
        }

        if (source === 'all' || ['tpb', '1337x', 'rutracker'].includes(source)) {
            promises.push(
                fetch(`${baseUrl}/api/torrents?q=${encodeURIComponent(query)}&source=${source}`)
                    .then(r => r.json())
                    .then(data => data.results || [])
                    .catch(() => [])
            );
        }

        // Execute all in parallel
        const resultsArrays = await Promise.all(promises);
        const aggregated = resultsArrays.flat();

        // Cache successful results
        if (aggregated.length > 0) {
            searchCache.set(cacheKey, aggregated);
        }

        performanceMonitor.track('search-miss', startTime);

        return NextResponse.json({
            success: true,
            results: aggregated,
            cached: false,
            latency: Date.now() - startTime,
            source: source
        });

    } catch (err: any) {
        return NextResponse.json({
            error: err.message,
            results: []
        }, { status: 500 });
    }
}
