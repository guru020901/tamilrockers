/**
 * MULTI-SOURCE TORRENT SEARCH ENGINE (MCP)
 * 
 * Unified search across multiple torrent sources:
 * - ThePirateBay (via thepibay.site)
 * - 1337x.to (with fallback)
 * - RuTracker.org (via Google Search scrape)
 * 
 * Port: 3008
 */

import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3008;

// Browser instance for scraping
let browser = null;

const getBrowser = async () => {
    if (!browser || !browser.isConnected()) {
        console.log('[TorrentSearch] Launching new browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Critical for Docker
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
            ],
            protocolTimeout: 60000
        });
    }
    return browser;
};

console.log(`
    ╔═══════════════════════════════════════════════════╗
    ║   MULTI-SOURCE TORRENT SEARCH ENGINE (MCP)        ║
    ║   Port: ${PORT}                                       ║
    ║                                                   ║
    ║   Endpoints:                                      ║
    ║   GET /search?q=<query>&source=all|tpb|1337x|ru   ║
    ║   GET /details?url=<torrent_url>&source=tpb|1337x ║
    ╚═══════════════════════════════════════════════════╝
`);

// ============================================
// THE PIRATE BAY SCRAPER
// ============================================
async function searchTPB(query, customDomain = null) {
    const results = [];
    let page = null;

    try {
        const b = await getBrowser();
        page = await b.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // TPB Proxy Rotation
        const mirrors = [
            'https://thepibay.site',
            'https://pirate-bay-proxy.org',
            'https://tpb.party',
            'https://thepiratebay.org'
        ];

        // If custom domain provided, try it FIRST
        if (customDomain) {
            mirrors.unshift(customDomain);
        }

        // ... (Existing TPB logic)
        let success = false;

        for (const mirror of mirrors) {
            try {
                const searchUrl = `${mirror}/search/${encodeURIComponent(query)}/0/99/0`;
                console.log(`[TPB] Trying: ${searchUrl}`);

                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

                const title = await page.title();
                if (title.includes('Pirate Bay') || title.includes('TPB')) {
                    success = true;
                    // Extract search results
                    const data = await page.evaluate(() => {
                        const items = [];
                        const rows = document.querySelectorAll('#searchResult tr:not(:first-child)');

                        rows.forEach(row => {
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
                    console.log(`[TPB] Found ${results.length} results from ${mirror}`);
                    break;
                }
            } catch (e) {
                console.log(`[TPB] Mirror ${mirror} failed, trying next...`);
            }
        }
    } catch (err) {
        console.error('[TPB] Search error:', err.message);
    } finally {
        if (page) await page.close();
    }

    return results;
}

// ============================================
// 1337x SCRAPER
// ============================================
async function search1337x(query) {
    const results = [];
    let page = null;

    try {
        const b = await getBrowser();
        page = await b.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // Extended 1337x mirrors
        const mirrors = [
            'https://1337x.to',
            'https://1337x.st',
            'https://1337x.so',
            'https://1337x.gd',
            'https://x1337x.ws',
            'https://x1337x.se',
            'https://1337xx.to',
            'https://1337x.unblockit.cat',
            'https://1337x.proxyninja.org'
        ];
        let success = false;

        for (const mirror of mirrors) {
            try {
                const searchUrl = `${mirror}/search/${encodeURIComponent(query)}/1/`;
                console.log(`[1337x] Trying: ${searchUrl}`);

                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
                success = true;
                break;
            } catch (e) {
                console.log(`[1337x] Mirror ${mirror} failed, trying next...`);
            }
        }

        if (!success) {
            console.log('[1337x] All mirrors failed');
            return null;
        }

        const data = await page.evaluate(() => {
            const items = [];
            const rows = document.querySelectorAll('table.table-list tbody tr');

            rows.forEach(row => {
                try {
                    const titleLink = row.querySelector('td.name a:nth-child(2)');
                    const seedersCell = row.querySelector('td.seeds');
                    const leechersCell = row.querySelector('td.leeches');
                    const sizeCell = row.querySelector('td.size');

                    if (titleLink) {
                        items.push({
                            title: titleLink.textContent.trim(),
                            url: titleLink.href,
                            magnet: null,
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
        console.log(`[1337x] Found ${results.length} results`);

    } catch (err) {
        console.error('[1337x] Search error:', err.message);
    } finally {
        if (page) await page.close();
    }

    return results;
}

// ============================================
// RuTracker SCRAPER (Google Method)
// ============================================
async function searchRuTracker(query, customDomain = null) {
    const results = [];
    let page = null;

    try {
        const targetDomain = customDomain || 'rutracker.org';
        console.log(`[RuTracker] Searching via Google: site:${targetDomain} ${query}`);
        const b = await getBrowser();
        page = await b.newPage();
        // Use a real browser User-Agent to avoid immediate bot detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 1. Search Google with stricter site filters
        // Using both .org and .net to catch mirrors
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent('site:' + targetDomain + ' ' + query)}`;
        await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // 2. Extract Topic URLs
        const topicUrls = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            return links
                .map(a => a.href)
                .filter(href => href && href.includes('rutracker.org/forum/viewtopic.php?t='))
                .slice(0, 5); // Take top 5 results
        });

        console.log(`[RuTracker] Found ${topicUrls.length} topics via Google`);

        // 3. Visit each topic and get magnet (Concurrent)
        const topicPromises = topicUrls.map(async (url) => {
            let topicPage = null;
            try {
                topicPage = await b.newPage();
                await topicPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

                // Use rutracker.net mirror if .org is blocked? Let's try .net first as it's often more accessible
                // or just stick to the URL found.
                // Replace domain to be safe: rutracker.org -> rutracker.net
                const safeUrl = url.replace('rutracker.org', 'rutracker.net');

                await topicPage.goto(safeUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

                const info = await topicPage.evaluate(() => {
                    const titleEl = document.querySelector('h1.maintitle');
                    const magnetEl = document.querySelector('a.magnet-link');
                    // Size is often in a table row with "Size" or just nearby text. 
                    // This is tricky on RuTracker without standardized selector, but let's try finding the torrent size text.
                    // Usually: <b>Running time</b>... <b>Size:</b> 1.4 GB
                    // Or <span title="Size">...</span>

                    // Simple text scraping
                    const text = document.body.innerText;
                    const sizeMatch = text.match(/Size:?\s*([\d.]+\s*[GMK]B)/i);
                    // Seekders/Leechers are harder to parse from plain topic page without login sometimes, 
                    // but often they are in a table at the bottom.
                    const seedMatch = text.match(/Seeders:\s*(\d+)/i); // Hypothetical

                    return {
                        title: titleEl ? titleEl.textContent.trim() : 'Unknown Title',
                        magnet: magnetEl ? magnetEl.href : null,
                        size: sizeMatch ? sizeMatch[1] : 'Unknown',
                        seeders: 0, // Hard to get reliably without login stats
                        leechers: 0
                    };
                });

                if (info.magnet) {
                    return {
                        ...info,
                        url: safeUrl,
                        source: 'rutracker'
                    };
                }
            } catch (e) {
                // console.error('Topic scrape error', e);
            } finally {
                if (topicPage) await topicPage.close();
            }
            return null;
        });

        const validResults = (await Promise.all(topicPromises)).filter(r => r !== null);
        results.push(...validResults);
        console.log(`[RuTracker] Extracted ${results.length} magnets`);

    } catch (err) {
        console.error('[RuTracker] Search error:', err.message);
    } finally {
        if (page) await page.close();
    }

    return results;
}

// Get magnet link from 1337x detail page
async function get1337xMagnet(url) {
    let page = null;
    try {
        const b = await getBrowser();
        page = await b.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const magnet = await page.evaluate(() => {
            const magnetLink = document.querySelector('a[href^="magnet:"]');
            return magnetLink ? magnetLink.href : null;
        });

        return magnet;
    } catch (err) {
        console.error('[1337x] Magnet fetch error:', err.message);
        return null;
    } finally {
        if (page) await page.close();
    }
}

// ============================================
// API ENDPOINTS
// ============================================

// Unified Search Endpoint
app.get('/search', async (req, res) => {
    const query = req.query.q;
    const source = req.query.source || 'all';

    // Custom domain overrides
    const tpbDomain = req.query.tpbDomain;
    const x1337Domain = req.query.x1337Domain;
    const ruDomain = req.query.ruDomain;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    console.log(`\n[Search] Query: "${query}", Source: ${source}`);
    if (tpbDomain) console.log(`[Search] Custom TPB: ${tpbDomain}`);

    let results = [];
    let status = { tpb: 'unchecked', '1337x': 'unchecked', 'rutracker': 'unchecked' };

    try {
        const promises = [];

        if (source === 'all' || source === 'tpb') {
            promises.push(searchTPB(query, tpbDomain).then(res => {
                if (res.length > 0) status.tpb = 'active';
                else if (source === 'tpb') status.tpb = 'no_results';
                return res;
            }));
        }

        if (source === 'all' || source === '1337x') {
            promises.push(search1337x(query, x1337Domain).then(res => {
                if (res === null) status['1337x'] = 'blocked';
                else status['1337x'] = 'active';
                return res || [];
            }));
        }

        if (source === 'all' || source === 'rutracker') {
            promises.push(searchRuTracker(query, ruDomain).then(res => {
                if (res.length > 0) status.rutracker = 'active';
                return res;
            }));
        }

        const resultsArray = await Promise.all(promises);
        resultsArray.forEach(r => results.push(...r));

        // Sort by seeders (most seeded first)
        results.sort((a, b) => b.seeders - a.seeders);

        console.log(`[Search] Total results: ${results.length}`);
        res.json({ success: true, query, results, status });

    } catch (err) {
        console.error('[Search] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Get magnet link for 1337x (since it requires visiting detail page)
app.get('/magnet', async (req, res) => {
    const url = req.query.url;
    const source = req.query.source;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }

    try {
        let magnet = null;

        if (source === '1337x') {
            magnet = await get1337xMagnet(url);
        } else {
            // For TPB and RuTracker, magnet is already in search results
            res.status(400).json({ error: 'Use search results for TPB/RuTracker magnets' });
            return;
        }

        if (magnet) {
            res.json({ success: true, magnet });
        } else {
            res.status(404).json({ error: 'Magnet not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', sources: ['tpb', '1337x', 'rutracker'] });
});

// Start server
app.listen(PORT, () => {
    console.log(`[TorrentSearch] Listening on port ${PORT}`);
});

// Cleanup on exit
process.on('SIGINT', async () => {
    if (browser) await browser.close();
    process.exit();
});
