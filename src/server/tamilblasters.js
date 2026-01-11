import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3009;
const DOMAIN = 'https://www.1tamilblasters.business';

// --- UTILS ---
async function getBrowser() {
    const userDataDir = path.join(process.cwd(), '.puppeteer_data_blasters');
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

// SEARCH API
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query required' });

    console.log(`[TamilBlasters] Searching for: "${query}"`);
    let browser = null;
    let page = null;
    let results = [];

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const searchUrl = `${DOMAIN}/?s=${encodeURIComponent(query)}`;
        console.log(`[TamilBlasters] Goto: ${searchUrl}`);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        results = await page.evaluate(() => {
            const items = document.querySelectorAll('article.post');
            return Array.from(items).map(item => {
                const titleEl = item.querySelector('.blog-entry-title a');
                const imgEl = item.querySelector('.nv-post-thumbnail-wrap img');

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

        console.log(`[TamilBlasters] Found ${results.length} results. Fetching magnets...`);

        // Fetch magnets for top results
        // Limit to 5 to avoid timeouts
        const enriched = await Promise.all(results.slice(0, 5).map(async (item) => {
            let detailPage = null;
            try {
                detailPage = await browser.newPage();
                await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                await detailPage.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 30000 });

                const magnetData = await detailPage.evaluate(() => {
                    const magnets = [];
                    // Look for magnet links
                    document.querySelectorAll('a[href^="magnet:?"]').forEach(l => magnets.push({ link: l.href, title: l.innerText, size: 'Unknown' }));

                    // Look for text magnets if no links
                    if (magnets.length === 0) {
                        const html = document.body.innerHTML;
                        const matches = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[a-zA-Z0-9=&%\-._]*/g);
                        if (matches) matches.forEach(m => magnets.push({ link: m, title: 'Text Magnet', size: 'Unknown' }));
                    }

                    // Look for .torrent files
                    document.querySelectorAll('a[href$=".torrent"]').forEach(l => magnets.push({ link: l.href, title: 'Torrent File', size: 'Unknown', isTorrentFile: true }));

                    // Dedupe
                    const unique = [];
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
            } catch (e) {
                console.error(`[TamilBlasters] Error details for ${item.link}:`, e.message);
                return { ...item, magnet: null, magnets: [] };
            } finally {
                if (detailPage) await detailPage.close();
            }
        }));

        // Merge enriched back
        results = [...enriched, ...results.slice(5)];

    } catch (err) {
        console.error('[TamilBlasters] Error:', err.message);
        return res.status(500).json({ error: err.message });
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }

    res.json({ success: true, results });
});

// DETAILS API
app.get('/details', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });

    console.log(`[TamilBlasters] Fetching details for: "${url}"`);
    let browser = null;
    let page = null;

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const data = await page.evaluate(() => {
            const magnets = [];
            // Look for magnet links
            document.querySelectorAll('a[href^="magnet:?"]').forEach(l => magnets.push({ link: l.href, title: l.innerText, size: 'Unknown' }));

            // Look for text magnets
            if (magnets.length === 0) {
                const html = document.body.innerHTML;
                const matches = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[a-zA-Z0-9=&%\-._]*/g);
                if (matches) matches.forEach(m => magnets.push({ link: m, title: 'Text Magnet', size: 'Unknown' }));
            }

            // Look for .torrent files
            document.querySelectorAll('a[href$=".torrent"]').forEach(l => magnets.push({ link: l.href, title: 'Torrent File', size: 'Unknown', isTorrentFile: true }));

            // Dedupe
            const unique = [];
            const seen = new Set();
            for (const m of magnets) {
                if (!seen.has(m.link)) { seen.add(m.link); unique.push(m); }
            }

            const poster = document.querySelector('.nv-post-thumbnail-wrap img')?.src || null;

            // Extract Watch/Stream URL
            let watch = null;
            // 1. Look for iframes
            const iframes = Array.from(document.querySelectorAll('iframe'));
            for (const iframe of iframes) {
                const src = iframe.src;
                if (src && (src.includes('cybervynx') || src.includes('youtube') || src.includes('dood') || src.includes('tape') || src.includes('embed'))) {
                    watch = src;
                    break;
                }
            }
            // 2. Fallback to first iframe if valid
            if (!watch && iframes.length > 0 && iframes[0].src && iframes[0].src.startsWith('http')) {
                watch = iframes[0].src;
            }

            return {
                magnets: unique,
                poster,
                watch // extracted stream url
            };
        });

        res.json({ success: true, data });

    } catch (err) {
        console.error('[TamilBlasters] Details Error:', err.message);
        return res.status(500).json({ error: err.message });
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
});

app.listen(PORT, () => {
    console.log(`[TamilBlasters] MCP Listening on ${PORT}`);
});
