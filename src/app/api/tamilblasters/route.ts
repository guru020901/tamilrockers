import { NextResponse } from 'next/server';
import { getBrowser } from '@/lib/browser';
import { searchCache, circuitBreaker } from '@/lib/cache';
import { performanceMonitor, prefetchManager } from '@/lib/advanced';

const DOMAIN = 'https://www.1tamilblasters.business';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    // Cache key
    const cacheKey = `tamilblasters:${query}`;

    // Check cache first
    const cached = searchCache.get(cacheKey);
    if (cached) {
        return NextResponse.json({ results: cached, cached: true });
    }

    // Circuit breaker check
    if (!circuitBreaker.canAttempt('tamilblasters')) {
        return NextResponse.json({ error: 'Service temporarily unavailable', results: [] }, { status: 503 });
    }

    const startTime = Date.now();
    prefetchManager.trackQuery(query);

    console.log(`[API/TamilBlasters] Searching for: "${query}"`);
    let browser = null;
    let page = null;
    let results: any[] = [];

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const searchUrl = `${DOMAIN}/?s=${encodeURIComponent(query)}`;
        console.log(`[API/TamilBlasters] Goto: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        results = await page.evaluate(() => {
            const items = document.querySelectorAll('article.post');
            return Array.from(items).map(item => {
                const titleEl = item.querySelector('.blog-entry-title a') as HTMLAnchorElement;
                const imgEl = item.querySelector('.nv-post-thumbnail-wrap img') as HTMLImageElement;

                if (!titleEl) return null;

                return {
                    title: titleEl.innerText.trim(),
                    link: titleEl.href,
                    id: titleEl.href.split('/').filter(Boolean).pop(), // simplified ID
                    poster: imgEl ? imgEl.src : null,
                    date: 'Unknown',
                    source: '1tamilblasters'
                };
            }).filter(Boolean);
        });

        console.log(`[API/TamilBlasters] Found ${results.length} results. Fetching magnets...`);

        // Fetch magnets for top results (Limit to 3 on Serverless to avoid timeout)
        // Vercel Hobby Limit is 10s. This is TIGHT.
        const enriched = await Promise.all(results.slice(0, 3).map(async (item: any) => {
            let detailPage = null;
            try {
                detailPage = await browser.newPage();
                await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                await detailPage.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 15000 }); // FAST timeout

                const magnetData = await detailPage.evaluate(() => {
                    const magnets: any[] = [];

                    // 1. Explicit Magnet Links (broad selector)
                    document.querySelectorAll('a[href^="magnet:"]').forEach((l: any) => {
                        magnets.push({ link: l.href, title: l.innerText.trim() || 'Magnet Link', size: 'Unknown' });
                    });

                    // 2. .torrent files
                    document.querySelectorAll('a[href$=".torrent"]').forEach((l: any) => {
                        magnets.push({ link: l.href, title: 'Torrent File', size: 'Unknown', isTorrentFile: true });
                    });

                    // 3. Text Magnets (in code blocks or plain text)
                    if (magnets.length === 0) {
                        const html = document.body.innerHTML;
                        const text = document.body.innerText;

                        // Regex for magnet links
                        const magnetRegex = /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}[a-zA-Z0-9=&%\-._]*/g;

                        const htmlMatches = html.match(magnetRegex) || [];
                        const textMatches = text.match(magnetRegex) || [];
                        const allMatches = [...new Set([...htmlMatches, ...textMatches])];

                        allMatches.forEach(m => magnets.push({ link: m, title: 'Text Magnet', size: 'Unknown' }));
                    }

                    // Dedupe
                    const unique: any[] = [];
                    const seen = new Set();
                    for (const m of magnets) {
                        if (!seen.has(m.link)) { seen.add(m.link); unique.push(m); }
                    }
                    return unique;
                });

                return {
                    ...item,
                    magnet: magnetData[0]?.link || null,
                    magnets: magnetData
                };
            } catch (e: any) {
                console.error(`[API/TamilBlasters] Error details for ${item.link}:`, e.message);
                return { ...item, magnet: null, magnets: [] };
            } finally {
                if (detailPage) await detailPage.close();
            }
        }));

        // Merge enriched back
        results = [...enriched, ...results.slice(3)];

        // Cache successful results
        if (results.length > 0) {
            searchCache.set(cacheKey, results);
            circuitBreaker.recordSuccess('tamilblasters');
            performanceMonitor.track('tamilblasters-search', startTime);
        }

    } catch (err: any) {
        console.error('[API/TamilBlasters] Error:', err.message);
        circuitBreaker.recordFailure('tamilblasters');
        performanceMonitor.track('tamilblasters-error', startTime);
        return NextResponse.json({ error: err.message }, { status: 500 });
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }

    return NextResponse.json({ success: true, results });
}
