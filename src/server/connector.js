import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
// import fetch from 'node-fetch'; // Native fetch used in Node 18+
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3007;
const FALLBACK_SERVICE_URL = process.env.BACKEND_TORRENTS_URL || 'http://localhost:3008';

// --- UTILS ---

async function getBrowser() {
    const userDataDir = path.join(process.cwd(), '.puppeteer_data');
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    return await puppeteer.launch({
        headless: "new",
        userDataDir: userDataDir,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu'
        ]
    });
}

async function resolve1TamilMVDomain() {
    return 'https://www.1tamilmv.do';
}

async function ensureLoggedIn(page, domain) {
    const username = process.env.TAMILMV_USERNAME;
    const password = process.env.TAMILMV_PASSWORD;

    if (!username || !password) return;

    try {
        await page.goto(domain, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const isLoggedIn = await page.evaluate(() => {
            return !!document.querySelector('a[href*="do=logout"]') ||
                !!document.querySelector('.cUserNav');
        });

        if (isLoggedIn) {
            console.log('[Connector] Session valid.');
            return;
        }

        console.log('[Connector] Attempting login...');
        await page.goto(`${domain}/index.php?/login/`, { waitUntil: 'domcontentloaded', timeout: 15000 });

        await page.waitForSelector('input[name="auth"]', { timeout: 5000 });
        await page.type('input[name="auth"]', username);
        await page.type('input[name="password"]', password);

        const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.click('button[type="submit"], input[type="submit"]');
        await navPromise;
        console.log('[Connector] Login submitted.');
    } catch (e) {
        console.log(`[Connector] Login failed: ${e.message}`);
    }
}

// SEARCH API
app.get('/api/search', async (req, res) => {
    let domain = req.query.domain || await resolve1TamilMVDomain();
    if (!domain.startsWith('http')) domain = 'https://' + domain;
    if (domain.endsWith('/')) domain = domain.slice(0, -1);

    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query required' });

    console.log(`[Connector] Searching for: "${query}" on ${domain}`);
    let browser = null;
    let page = null;
    let results = [];

    // 1. Try 1TamilMV
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        if (process.env.TAMILMV_USERNAME) {
            await ensureLoggedIn(page, domain);
        }

        const searchUrls = [
            `${domain}/index.php?/search/&q=${encodeURIComponent(query)}&type=forums_topic`,
            `${domain}/index.php?/search/&q=${encodeURIComponent(query)}`,
            `${domain}/search/?q=${encodeURIComponent(query)}`
        ];

        for (const searchUrl of searchUrls) {
            console.log(`[Connector] Trying: ${searchUrl}`);
            try {
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                try { await page.waitForSelector('.ipsStreamItem, .ipsDataItem', { timeout: 4000 }); } catch (e) { }

                results = await page.evaluate(() => {
                    let items = document.querySelectorAll('.ipsStreamItem');
                    if (items.length === 0) items = document.querySelectorAll('.ipsDataItem');
                    if (items.length === 0) items = document.querySelectorAll('[data-controller="core.front.core.searchResult"]');

                    return Array.from(items).map(item => {
                        const titleEl = item.querySelector('.ipsStreamItem_title a, .ipsDataItem_title a, h4 a');
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

        // Google Fallback for 1TamilMV
        if (results.length === 0) {
            console.log('[Connector] 1TamilMV Direct search failed. Trying Google Fallback for 1TamilMV...');
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

        console.log(`[Connector] 1TamilMV found ${results.length} results. Fetching details...`);
        const resultsWithMagnets = await Promise.all(
            results.slice(0, 5).map(async (result) => {
                let detailPage = null;
                try {
                    detailPage = await browser.newPage();
                    await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                    await detailPage.goto(result.link, { waitUntil: 'domcontentloaded', timeout: 20000 });

                    const magnetData = await detailPage.evaluate(() => {
                        const magnets = [];
                        document.querySelectorAll('a[href^="magnet:?"]').forEach(l => magnets.push({ link: l.href, title: l.innerText }));
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

                    await detailPage.close();

                    if (magnetData.length === 0 && isGuest) result.locked = true;

                    return { ...result, magnet: magnetData[0]?.link || null, magnets: magnetData, source: '1tamilmv' };
                } catch (e) {
                    if (detailPage) await detailPage.close();
                    return { ...result, magnet: null, source: '1tamilmv' };
                }
            })
        );
        results = resultsWithMagnets;

    } catch (err) {
        console.error('[Connector] 1TamilMV Error:', err.message);
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }

    // 2. FALLBACK to TorrentSearch (1337x) if 1TamilMV failed or returned locked content
    const validMagnets = results.filter(r => r.magnet && !r.locked).length;

    if (validMagnets === 0) {
        console.log(`[Connector] ⚠️ No accessible magnets/results on 1TamilMV. Using Fallback Service (1337x)...`);
        try {
            // Prioritize 1337x for robustness
            const fallbackRes = await fetch(`${FALLBACK_SERVICE_URL}/search?q=${encodeURIComponent(query)}&source=1337x`);
            const fallbackData = await fallbackRes.json();

            if (fallbackData.results && fallbackData.results.length > 0) {
                console.log(`[Connector] Fallback Service found ${fallbackData.results.length} results.`);

                // Fetch magnets for top 3 fallback items (1337x requires detail lookup)
                const fallbackItems = await Promise.all(fallbackData.results.slice(0, 3).map(async (item) => {
                    let magnet = item.magnet;
                    // If no magnet in search result (common for 1337x), fetch it
                    if (!magnet) {
                        try {
                            const magRes = await fetch(`${FALLBACK_SERVICE_URL}/magnet?url=${encodeURIComponent(item.url)}&source=1337x`);
                            const magData = await magRes.json();
                            if (magData.success) magnet = magData.magnet;
                        } catch (e) { }
                    }

                    return {
                        title: item.title,
                        link: item.url,
                        magnet: magnet || null,
                        size: item.size,
                        date: 'Unknown',
                        source: '1tamilmv', // Masquerade as 1TamilMV for UI consistency
                        original_source: '1337x',
                        is_fallback: true
                    };
                }));

                // Add to results
                results = [...results, ...fallbackItems];
            }
        } catch (e) {
            console.error(`[Connector] Fallback Service Failed: ${e.message}`);
        }
    }

    res.json({ success: true, results: results });
});

// DETAILS API
app.get('/api/details', async (req, res) => {
    // If it's a fallback URL (1337x), we shouldn't really use this endpoint unless we adapt it.
    // But basic scraping might work if structure is simple. 
    // For now, assume this is mainly for 1TamilMV topics.

    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });

    // Quick check if it's 1337x -> redirect to fallback service? 
    // No, let's keep it simple.

    console.log(`[Connector] Scraping details: ${url}`);
    let browser = null;
    let page = null;

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const data = await page.evaluate(() => {
            const magnetLinks = Array.from(document.querySelectorAll('a[href^="magnet:?"]')).map(a => ({ link: a.href, text: a.innerText }));
            if (magnetLinks.length === 0) {
                const html = document.body.innerHTML;
                const matches = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[a-zA-Z0-9=&%\-._]*/g);
                if (matches) matches.forEach(m => magnetLinks.push({ link: m, text: 'Text Magnet' }));
            }
            const poster = document.querySelector('.cPost_contentWrap img')?.src || '';

            // IMDB
            let imdbId = '';
            const imdbLink = Array.from(document.querySelectorAll('a[href*="imdb.com/title/tt"]'))[0];
            if (imdbLink) imdbId = imdbLink.href.match(/tt\d+/)?.[0] || '';
            else {
                const match = document.body.innerText.match(/imdb\.com\/title\/(tt\d+)/i);
                if (match) imdbId = match[1];
            }

            return { magnets: magnetLinks, poster, imdbId, title: document.title };
        });

        res.json({ success: true, data });

    } catch (err) {
        console.error('[Connector] Details Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
});

// PROXY (HLS/TS) - Standard
app.get('/api/proxy-hls', async (req, res) => {
    const { url, referer } = req.query;
    if (!url) return res.status(400).send('URL required');
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': referer || new URL(url).origin } });
        let m3u8 = await response.text();
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        const lines = m3u8.split('\n');
        const rewritten = lines.map(line => {
            if (line.trim() && !line.startsWith('#')) {
                const chunkUrl = line.startsWith('http') ? line : baseUrl + line;
                return `http://localhost:3007/api/proxy-ts?url=${encodeURIComponent(chunkUrl)}&referer=${encodeURIComponent(referer || '')}`;
            }
            return line;
        });
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(rewritten.join('\n'));
    } catch (e) { res.status(500).send('Proxy Error'); }
});

app.get('/api/proxy-ts', async (req, res) => {
    const { url, referer } = req.query;
    if (!url) return res.status(400).send('URL required');
    try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': referer || new URL(url).origin } });
        res.set('Content-Type', 'video/mp2t');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(Buffer.from(await response.arrayBuffer()));
    } catch (e) { res.status(500).send('Chunk Error'); }
});

app.listen(PORT, () => {
    console.log(`[Connector] Running on ${PORT} with 1TamilMV + Fallback logic (Port 3008)`);
});
