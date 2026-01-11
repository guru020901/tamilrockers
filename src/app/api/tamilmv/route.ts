import { NextResponse } from 'next/server';
import { searchCache, circuitBreaker } from '@/lib/cache';
import { performanceMonitor, prefetchManager } from '@/lib/advanced';
import { getDomain } from '@/lib/config';

/**
 * PUPPETEER-FREE 1TamilMV Scraper
 * Uses fetch + regex parsing (works on Vercel serverless!)
 */

export async function GET(request: Request) {
    const startTime = Date.now();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    // Priority: Query Param > Admin Config > Default
    const domain = searchParams.get('domain') || await getDomain('1tamilmv');

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const cacheKey = `tamilmv:${query}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
        performanceMonitor.track('tamilmv-cached', startTime);
        return NextResponse.json({ success: true, results: cached, cached: true });
    }

    if (!circuitBreaker.canAttempt('tamilmv')) {
        return NextResponse.json({ error: 'Service temporarily unavailable', results: [] }, { status: 503 });
    }

    prefetchManager.trackQuery(query);
    console.log(`[API/TamilMV] Searching for: "${query}" on ${domain}`);

    try {
        // Fetch the search page using simple HTTP request
        const searchUrl = `${domain}/index.php?/search/&q=${encodeURIComponent(query)}&type=forums_topic&sortby=relevancy&search_in=titles`;

        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': domain,
            },
            signal: AbortSignal.timeout(15000), // 15s timeout
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        // Parse results using regex (no Puppeteer needed!)
        const results: any[] = [];

        // Pattern to match search result items
        const itemPattern = /<li[^>]*class="[^"]*ipsStreamItem[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
        const titlePattern = /<a[^>]*class="[^"]*ipsStreamItem_title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
        const snippetPattern = /<div[^>]*class="[^"]*ipsStreamItem_snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

        let match;
        while ((match = itemPattern.exec(html)) !== null) {
            const itemHtml = match[1];

            const titleMatch = titlePattern.exec(itemHtml);
            const snippetMatch = snippetPattern.exec(itemHtml);

            if (titleMatch) {
                const link = titleMatch[1].replace(/&amp;/g, '&');
                const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
                const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

                // Skip if no title
                if (!title) continue;

                // Extract ID from URL
                const idMatch = link.match(/topic\/(\d+)/);
                const id = idMatch ? idMatch[1] : `tamilmv-${results.length}`;

                results.push({
                    id,
                    title,
                    link,
                    snippet,
                    source: '1tamilmv',
                    // No direct magnet from search, needs details page
                });
            }
        }

        // Alternative pattern for forum topic listings
        if (results.length === 0) {
            const topicPattern = /<a[^>]*href="([^"]*topic[^"]+)"[^>]*title="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
            while ((match = topicPattern.exec(html)) !== null) {
                const link = match[1].replace(/&amp;/g, '&');
                const title = (match[2] || match[3]).replace(/<[^>]+>/g, '').trim();

                if (title && title.length > 5) {
                    const idMatch = link.match(/topic\/(\d+)/);
                    const id = idMatch ? idMatch[1] : `tamilmv-${results.length}`;

                    results.push({
                        id,
                        title,
                        link: link.startsWith('http') ? link : domain + link,
                        source: '1tamilmv',
                    });
                }
            }
        }

        // Cache successful results
        if (results.length > 0) {
            searchCache.set(cacheKey, results);
            circuitBreaker.recordSuccess('tamilmv');
            performanceMonitor.track('tamilmv-search', startTime);
        }

        console.log(`[API/TamilMV] Found ${results.length} results`);
        return NextResponse.json({ success: true, results });

    } catch (err: any) {
        console.error('[API/TamilMV] Error:', err.message);
        circuitBreaker.recordFailure('tamilmv');
        performanceMonitor.track('tamilmv-error', startTime);
        return NextResponse.json({ error: err.message, results: [] }, { status: 500 });
    }
}
