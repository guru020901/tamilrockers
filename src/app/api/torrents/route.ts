import { NextResponse } from 'next/server';
import { searchCache, circuitBreaker } from '@/lib/cache';
import { performanceMonitor, prefetchManager } from '@/lib/advanced';

/**
 * PUPPETEER-FREE Torrent Search API
 * Uses fetch + regex parsing (works on Vercel serverless!)
 * Supports: TPB, 1337x, RuTracker
 */

// TPB Search (via proxy API)
async function searchTPB(query: string): Promise<any[]> {
    const cacheKey = `tpb:${query}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    if (!circuitBreaker.canAttempt('tpb')) return [];

    try {
        // Use apibay.org (TPB API)
        const apiUrl = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;

        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // API returns array or {id: "0"} for no results
        if (!Array.isArray(data) || (data.length === 1 && data[0].id === '0')) {
            return [];
        }

        const results = data.slice(0, 20).map((item: any) => ({
            id: item.id,
            title: item.name,
            size: formatBytes(parseInt(item.size)),
            seeders: parseInt(item.seeders) || 0,
            leechers: parseInt(item.leechers) || 0,
            magnet: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}&tr=udp://tracker.opentrackr.org:1337`,
            source: 'tpb',
        }));

        if (results.length > 0) {
            searchCache.set(cacheKey, results);
            circuitBreaker.recordSuccess('tpb');
        }

        return results;
    } catch (err: any) {
        console.error('[TPB] Error:', err.message);
        circuitBreaker.recordFailure('tpb');
        return [];
    }
}

// 1337x Search (via HTML scraping)
async function search1337x(query: string): Promise<any[]> {
    const cacheKey = `1337x:${query}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    if (!circuitBreaker.canAttempt('1337x')) return [];

    try {
        const searchUrl = `https://www.1337x.to/search/${encodeURIComponent(query)}/1/`;

        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html',
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        const results: any[] = [];

        // Parse table rows
        const rowPattern = /<tr>([\s\S]*?)<\/tr>/gi;
        const titlePattern = /<a[^>]*href="(\/torrent\/[^"]+)"[^>]*>([^<]+)<\/a>/i;
        const sizePattern = /<td[^>]*class="[^"]*coll-4[^"]*"[^>]*>([^<]+)<\/td>/i;
        const seedPattern = /<td[^>]*class="[^"]*coll-2[^"]*seeds[^"]*"[^>]*>([^<]+)<\/td>/i;
        const leechPattern = /<td[^>]*class="[^"]*coll-3[^"]*leeches[^"]*"[^>]*>([^<]+)<\/td>/i;

        let match;
        while ((match = rowPattern.exec(html)) !== null && results.length < 20) {
            const row = match[1];

            const titleMatch = titlePattern.exec(row);
            if (!titleMatch) continue;

            const sizeMatch = sizePattern.exec(row);
            const seedMatch = seedPattern.exec(row);
            const leechMatch = leechPattern.exec(row);

            results.push({
                id: titleMatch[1].split('/')[2] || `1337x-${results.length}`,
                title: titleMatch[2].trim(),
                link: `https://www.1337x.to${titleMatch[1]}`,
                size: sizeMatch ? sizeMatch[1].trim() : 'Unknown',
                seeders: seedMatch ? parseInt(seedMatch[1]) || 0 : 0,
                leechers: leechMatch ? parseInt(leechMatch[1]) || 0 : 0,
                source: '1337x',
            });
        }

        if (results.length > 0) {
            searchCache.set(cacheKey, results);
            circuitBreaker.recordSuccess('1337x');
        }

        return results;
    } catch (err: any) {
        console.error('[1337x] Error:', err.message);
        circuitBreaker.recordFailure('1337x');
        return [];
    }
}

// RuTracker Search (simplified)
async function searchRuTracker(query: string): Promise<any[]> {
    // RuTracker requires login - return empty for now
    // In production, use a proxy service or pre-authenticated session
    return [];
}

// Helper function
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// MAIN HANDLER
export async function GET(request: Request) {
    const startTime = Date.now();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const source = searchParams.get('source') || 'all';

    if (!query) {
        return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    prefetchManager.trackQuery(query);
    console.log(`[API/Torrents] Searching "${query}" on ${source}`);

    try {
        const promises: Promise<any[]>[] = [];

        if (source === 'all' || source === 'tpb') {
            promises.push(searchTPB(query));
        }
        if (source === 'all' || source === '1337x') {
            promises.push(search1337x(query));
        }
        if (source === 'all' || source === 'rutracker') {
            promises.push(searchRuTracker(query));
        }

        const resultsArrays = await Promise.all(promises);
        const results = resultsArrays.flat();

        // Sort by seeders
        results.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

        performanceMonitor.track(`torrents-${source}`, startTime);

        return NextResponse.json({
            success: true,
            results,
            count: results.length,
        });

    } catch (err: any) {
        console.error('[API/Torrents] Error:', err.message);
        performanceMonitor.track('torrents-error', startTime);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
