import { NextResponse } from 'next/server';
import { getBrowser } from '@/lib/browser';
import { searchCache, requestDeduplicator, circuitBreaker } from '@/lib/cache';
import { performanceMonitor, prefetchManager } from '@/lib/advanced';

const FALLBACK_SERVICE_URL = 'http://localhost:3000/api/torrents'; // Internal call to our own route

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    let domain = searchParams.get('domain') || 'https://www.1tamilmv.do';

    if (domain && !domain.startsWith('http')) domain = 'https://' + domain;
    if (domain.endsWith('/')) domain = domain.slice(0, -1);

    if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 });

    // Cache key
    const cacheKey = `tamilmv:${query}:${domain}`;

    // Check cache first
    const cached = searchCache.get(cacheKey);
    if (cached) {
        return NextResponse.json({ results: cached, cached: true });
    }

    // Circuit breaker check
    if (!circuitBreaker.canAttempt('tamilmv')) {
        return NextResponse.json({ error: 'Service temporarily unavailable', results: [] }, { status: 503 });
    }

    const startTime = Date.now();

    // Track popular queries for prefetching
    prefetchManager.trackQuery(query);

    console.log(`[API/TamilMV] Searching for: "${query}" on ${domain}`);
    let browser = null;
    let page = null;
    let results: any[] = [];

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // Note: Login logic removed for Vercel Serverless optimization. 
        // We assume Guest mode. Some content might be locked.

        const searchUrls = [
            `${domain}/index.php?/search/&q=${encodeURIComponent(query)}&type=forums_topic`,
            `${domain}/index.php?/search/&q=${encodeURIComponent(query)}`,
            `${domain}/search/?q=${encodeURIComponent(query)}`
        ];

        for (const searchUrl of searchUrls) {
            console.log(`[API/TamilMV] Trying: ${searchUrl}`);
            try {
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                try { await page.waitForSelector('.ipsStreamItem, .ipsDataItem', { timeout: 4000 }); } catch (e) { }

                results = await page.evaluate(() => {
                    let items = document.querySelectorAll('.ipsStreamItem');
                    if (items.length === 0) items = document.querySelectorAll('.ipsDataItem');
                    if (items.length === 0) items = document.querySelectorAll('[data-controller="core.front.core.searchResult"]');

                    return Array.from(items).map(item => {
                        const titleEl = item.querySelector('.ipsStreamItem_title a, .ipsDataItem_title a, h4 a') as HTMLAnchorElement;
                        if (!titleEl) return null;

                        let link = titleEl.href;
                        try {
                            const urlObj = new URL(link);
                            if (urlObj.pathname.includes('/topic/')) link = urlObj.origin + urlObj.pathname;
                        } catch (e) { }

                        return {
                            title: titleEl.innerText.trim(),
                            link: link,
                            id: link.match(/topic\/(\d+)-/)?.[1] || null,
                            date: 'Unknown'
                        };
                    }).filter(Boolean);
                });

                if (results.length > 0) break;
            } catch (e) { }
        }

        // Google Fallback
        if (results.length === 0) {
            console.log('[API/TamilMV] Direct search failed. Trying Google Fallback...');
            try {
                await page.goto(`https://www.google.com/search?q=${encodeURIComponent(`site:${domain.replace('https://', '')} ${query}`)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                results = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('.g')).map(item => {
                        const titleEl = item.querySelector('h3');
                        const linkEl = item.querySelector('a');
                        if (!titleEl || !linkEl) return null;
                        const link = linkEl.href;
                        if (!link.includes('topic/')) return null;
                        return { title: titleEl.innerText.trim(), link, id: link.match(/topic\/(\d+)-/)?.[1] || null, date: 'Unknown' };
                    }).filter(Boolean);
                });
            } catch (e) { }
        }

        console.log(`[API/TamilMV] Found ${results.length} results. Fetching details...`);
        // Limit to 3 details fetch for timeout safety
        const resultsWithMagnets = await Promise.all(
            results.slice(0, 3).map(async (result: any) => {
                let detailPage = null;
                try {
                    detailPage = await browser.newPage();
                    await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                    await detailPage.goto(result.link, { waitUntil: 'domcontentloaded', timeout: 15000 });

                    const magnetData = await detailPage.evaluate(() => {
                        const magnets: any[] = [];
                        document.querySelectorAll('a[href^="magnet:?"]').forEach((l: any) => magnets.push({ link: l.href, title: l.innerText }));
                        if (magnets.length === 0) {
                            const html = document.body.innerHTML;
                            const matches = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[a-zA-Z0-9=&%\-._]*/g);
                            if (matches) matches.forEach(m => magnets.push({ link: m, title: 'Text Magnet' }));
                        }
                        return magnets;
                    });

                    const isGuest = await detailPage.evaluate(() => {
                        return document.body.innerText.includes('Please sign in to comment') ||
                            document.body.innerText.includes('Existing user? Sign In');
                    });

                    if (magnetData.length === 0 && isGuest) result.locked = true;

                    return { ...result, magnet: magnetData[0]?.link || null, magnets: magnetData, source: '1tamilmv' };
                } catch (e) {
                    return { ...result, magnet: null, source: '1tamilmv' };
                } finally {
                    if (detailPage) await detailPage.close();
                }
            })
        );
        results = resultsWithMagnets;

        // Fallback Logic (1337x) if locked/empty
        const validMagnets = results.filter((r: any) => r.magnet && !r.locked).length;
        if (validMagnets === 0) {
            console.log(`[API/TamilMV] No accessible magnets. Triggering 1337x fallback...`);
            // We can call our own /api/torrents route internally or just skip it to save time
            // For Vercel, calling another API route (via fetch) is fine but consumes execution time.
            // We'll skip for now to ensure we return *something* quickly, or implement partial fallback if vital.
            // Let's rely on the frontend "All Sources" which calls 1337x anyway.
        }

        // Cache successful results
        if (results.length > 0) {
            searchCache.set(cacheKey, results);
            circuitBreaker.recordSuccess('tamilmv');
            performanceMonitor.track('tamilmv-search', startTime);
        }

    } catch (err: any) {
        console.error('[API/TamilMV] Error:', err.message);
        circuitBreaker.recordFailure('tamilmv');
        performanceMonitor.track('tamilmv-error', startTime);
        return NextResponse.json({ error: err.message }, { status: 500 });
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }

    return NextResponse.json({ success: true, results });
}
