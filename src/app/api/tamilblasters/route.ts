import { NextResponse } from 'next/server';
import { searchCache, circuitBreaker } from '@/lib/cache';
import { performanceMonitor, prefetchManager } from '@/lib/advanced';

/**
 * PUPPETEER-FREE 1TamilBlasters Scraper
 * Uses fetch + regex parsing (works on Vercel serverless!)
 */

const DOMAIN = 'https://www.1tamilblasters.business';

export async function GET(request: Request) {
    const startTime = Date.now();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const cacheKey = `tamilblasters:${query}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
        performanceMonitor.track('tamilblasters-cached', startTime);
        return NextResponse.json({ success: true, results: cached, cached: true });
    }

    if (!circuitBreaker.canAttempt('tamilblasters')) {
        return NextResponse.json({ error: 'Service temporarily unavailable', results: [] }, { status: 503 });
    }

    prefetchManager.trackQuery(query);
    console.log(`[API/TamilBlasters] Searching for: "${query}"`);

    try {
        // Fetch the search page using simple HTTP request
        const searchUrl = `${DOMAIN}/?s=${encodeURIComponent(query)}`;

        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': DOMAIN,
            },
            signal: AbortSignal.timeout(15000), // 15s timeout
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        // Parse results using regex (no Puppeteer needed!)
        const results: any[] = [];

        // Pattern for article/post items on WordPress-based site
        const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi;
        const titleLinkPattern = /<a[^>]*href="([^"]+)"[^>]*rel="bookmark"[^>]*>([\s\S]*?)<\/a>/i;
        const altTitlePattern = /<h\d[^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
        const thumbnailPattern = /<img[^>]*src="([^"]+)"[^>]*>/i;

        let match;
        while ((match = articlePattern.exec(html)) !== null) {
            const articleHtml = match[1];

            let titleMatch = titleLinkPattern.exec(articleHtml);
            if (!titleMatch) {
                titleMatch = altTitlePattern.exec(articleHtml);
            }

            const thumbMatch = thumbnailPattern.exec(articleHtml);

            if (titleMatch) {
                const link = titleMatch[1].replace(/&amp;/g, '&');
                const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
                const thumbnail = thumbMatch ? thumbMatch[1] : null;

                // Skip if no title or too short
                if (!title || title.length < 3) continue;

                // Extract ID from URL (post ID or slug)
                const idMatch = link.match(/\/(\d+)\/?$/) || link.match(/\/([^\/]+)\/?$/);
                const id = idMatch ? idMatch[1] : `tb-${results.length}`;

                results.push({
                    id,
                    title: title.replace(/Download|Tamil|Review|Online/gi, '').trim(),
                    link,
                    thumbnail,
                    source: '1tamilblasters',
                });
            }
        }

        // Alternative: Look for direct post links if article pattern fails
        if (results.length === 0) {
            const postLinkPattern = /<a[^>]*href="(https?:\/\/[^"]*1tamilblasters[^"]*\/[^"]*)"[^>]*>([^<]{10,})<\/a>/gi;
            const seen = new Set();

            while ((match = postLinkPattern.exec(html)) !== null) {
                const link = match[1].replace(/&amp;/g, '&');
                const title = match[2].trim();

                // Skip duplicates and non-content links
                if (seen.has(link) || link.includes('/category/') || link.includes('/tag/')) continue;
                seen.add(link);

                if (title.length > 10) {
                    const idMatch = link.match(/\/(\d+)\/?$/) || link.match(/\/([^\/]+)\/?$/);
                    const id = idMatch ? idMatch[1] : `tb-${results.length}`;

                    results.push({
                        id,
                        title: title.replace(/Download|Tamil|Review|Online/gi, '').trim(),
                        link,
                        source: '1tamilblasters',
                    });
                }
            }
        }

        // Cache successful results
        if (results.length > 0) {
            searchCache.set(cacheKey, results);
            circuitBreaker.recordSuccess('tamilblasters');
            performanceMonitor.track('tamilblasters-search', startTime);
        }

        console.log(`[API/TamilBlasters] Found ${results.length} results`);
        return NextResponse.json({ success: true, results });

    } catch (err: any) {
        console.error('[API/TamilBlasters] Error:', err.message);
        circuitBreaker.recordFailure('tamilblasters');
        performanceMonitor.track('tamilblasters-error', startTime);
        return NextResponse.json({ error: err.message, results: [] }, { status: 500 });
    }
}
