import { NextResponse } from 'next/server';
import { getBrowser } from '@/lib/browser';
import { searchCache, circuitBreaker } from '@/lib/cache';
import { performanceMonitor, prefetchManager } from '@/lib/advanced';

/**
 * Serverless Torrent Search API
 * Migrated from src/server/torrent-search.js for Vercel deployment.
 */

// ============================================
// THE PIRATE BAY SCRAPER
// ============================================
async function searchTPB(query: string, customDomain: string | null) {
    // Check cache first
    const cacheKey = `tpb:${query}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    // Circuit breaker
    if (!circuitBreaker.canAttempt('tpb')) return [];

    const results: any[] = [];
    let page = null;
    let browser = null;

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        const mirrors = [
            'https://thepibay.site',
            'https://pirate-bay-proxy.org',
            'https://tpb.party',
            'https://thepiratebay.org'
        ];

        if (customDomain) mirrors.unshift(customDomain);

        for (const mirror of mirrors) {
            try {
                const searchUrl = `${mirror}/search/${encodeURIComponent(query)}/0/99/0`;
                console.log(`[API/Torrents/TPB] Trying: ${searchUrl}`);

                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

                const title = await page.title();
                if (title.includes('Pirate Bay') || title.includes('TPB')) {
                    const data = await page.evaluate(() => {
                        const items: any[] = [];
                        const rows = document.querySelectorAll('#searchResult tr:not(:first-child)');
                        rows.forEach((row: any) => {
                            try {
                                const titleLink = row.querySelector('a.detLink');
                                const magnetLink = row.querySelector('a[href^="magnet:"]');
                                const sizeMatch = row.textContent.match(/Size ([\d.]+\s*[GMK]iB)/i);
                                const seedersCell = row.querySelector('td:nth-child(3)');
                                const leechersCell = row.querySelector('td:nth-child(4)');

                                if (titleLink && magnetLink) {
                                    items.push({
                                        title: titleLink.textContent.trim(),
                                        url: titleLink.href,
                                        magnet: magnetLink.href,
                                        size: sizeMatch ? sizeMatch[1] : 'Unknown',
                                        seeders: seedersCell ? parseInt(seedersCell.textContent) || 0 : 0,
                                        leechers: leechersCell ? parseInt(leechersCell.textContent) || 0 : 0
                                    });
                                }
                            } catch (e) { }
                        });
                        return items;
                    });

                    results.push(...data.map(item => ({ ...item, source: 'tpb' })));
                    break;
                }
            } catch (e) { }
        }
    } catch (err: any) {
        console.error('[API/Torrents/TPB] Search error:', err.message);
        circuitBreaker.recordFailure('tpb');
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }

    // Cache and record success
    if (results.length > 0) {
        searchCache.set(cacheKey, results);
        circuitBreaker.recordSuccess('tpb');
    }

    return results;
}

// ============================================
// 1337x SCRAPER
// ============================================
async function search1337x(query: string, customDomain: string | null) {
    // Check cache first
    const cacheKey = `1337x:${query}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    // Circuit breaker
    if (!circuitBreaker.canAttempt('1337x')) return [];

    const results: any[] = [];
    let page = null;
    let browser = null;

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        const mirrors = [
            'https://1337x.to',
            'https://1337x.st',
            'https://1337x.so',
            'https://1337x.gd'
        ];

        // Use custom domain if provided? The original code didn't use it for 1337x, but logic was there.
        // Assuming customDomain matches one of these or user wants override.
        if (customDomain) mirrors.unshift(customDomain);

        let success = false;
        for (const mirror of mirrors) {
            try {
                const searchUrl = `${mirror}/search/${encodeURIComponent(query)}/1/`;
                console.log(`[API/Torrents/1337x] Trying: ${searchUrl}`);
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
                success = true;
                break;
            } catch (e) { }
        }

        if (success) {
            const data = await page.evaluate(() => {
                const items: any[] = [];
                const rows = document.querySelectorAll('table.table-list tbody tr');
                rows.forEach((row: any) => {
                    try {
                        const titleLink = row.querySelector('td.name a:nth-child(2)');
                        const seedersCell = row.querySelector('td.seeds');
                        const leechersCell = row.querySelector('td.leeches');
                        const sizeCell = row.querySelector('td.size');

                        if (titleLink) {
                            items.push({
                                title: titleLink.textContent.trim(),
                                url: titleLink.href,
                                magnet: null, // Requires detail fetch
                                size: sizeCell ? sizeCell.childNodes[0].textContent.trim() : 'Unknown',
                                seeders: seedersCell ? parseInt(seedersCell.textContent) || 0 : 0,
                                leechers: leechersCell ? parseInt(leechersCell.textContent) || 0 : 0
                            });
                        }
                    } catch (e) { }
                });
                return items;
            });
            results.push(...data.map(item => ({ ...item, source: '1337x' })));
        }
    } catch (err: any) {
        console.error('[API/Torrents/1337x] Search error:', err.message);
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
    return results;
}

// ============================================
// RuTracker SCRAPER
// ============================================
async function searchRuTracker(query: string, customDomain: string | null) {
    const results: any[] = [];
    let page = null;
    let browser = null;

    try {
        const targetDomain = customDomain || 'rutracker.org';
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent('site:' + targetDomain + ' ' + query)}`;
        await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const topicUrls = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            return links
                .map(a => a.href)
                .filter(href => href && href.includes('rutracker.org/forum/viewtopic.php?t='))
                .slice(0, 3); // Top 3 to save time
        });

        for (const url of topicUrls) {
            try {
                const safeUrl = url.replace('rutracker.org', 'rutracker.net'); // fast mirror
                await page.goto(safeUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

                const info = await page.evaluate(() => {
                    const titleEl = document.querySelector('h1.maintitle');
                    const magnetEl = document.querySelector('a.magnet-link') as HTMLAnchorElement;
                    const text = document.body.innerText;
                    const sizeMatch = text.match(/Size:?\s*([\d.]+\s*[GMK]B)/i);

                    return {
                        title: titleEl ? titleEl.textContent?.trim() : 'Unknown',
                        magnet: magnetEl ? magnetEl.href : null,
                        size: sizeMatch ? sizeMatch[1] : 'Unknown',
                        seeders: 0,
                        leechers: 0
                    };
                });

                if (info.magnet) {
                    results.push({ ...info, url: safeUrl, source: 'rutracker' });
                }
            } catch (e) { }
        }
    } catch (err: any) {
        console.error('[API/Torrents/RuTracker] Error:', err.message);
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
    return results;
}


// MAIN HANDLER
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const source = searchParams.get('source') || 'all';

    // Custom domain params
    const tpbDomain = searchParams.get('tpbDomain');
    const x1337Domain = searchParams.get('x1337Domain');
    const ruDomain = searchParams.get('ruDomain');

    if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 });

    const startTime = Date.now();
    prefetchManager.trackQuery(query);

    // Optimization: If running on Vercel, prioritize ONE source per request if possible, 
    // or run them in parallel but be mindful of CPU/Memory.
    // For "All Sources", we run parallel.

    try {
        const promises = [];

        if (source === 'all' || source === 'tpb') {
            promises.push(searchTPB(query, tpbDomain));
        }

        if (source === 'all' || source === '1337x') {
            promises.push(search1337x(query, x1337Domain));
        }

        if (source === 'all' || source === 'rutracker') {
            promises.push(searchRuTracker(query, ruDomain));
        }

        // Wait for all (Promise.allSettled might be better to avoid one failure killing all,
        // but the individual functions catch their own errors and return empty arrays).
        const resultsArray = await Promise.all(promises);
        const results = resultsArray.flat();

        results.sort((a: any, b: any) => b.seeders - a.seeders);

        performanceMonitor.track(`torrents-${source}`, startTime);

        return NextResponse.json({ success: true, results, status: {} });

    } catch (err: any) {
        performanceMonitor.track('torrents-error', startTime);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
