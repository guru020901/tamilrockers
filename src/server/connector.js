import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';

const app = express();
app.use(cors());

const PORT = 3007;

// Browser instance management
let browser = null;

async function getBrowser() {
    if (!browser || !browser.isConnected()) {
        console.log('[Connector] Launching new browser...');
        browser = await puppeteer.launch({
            headless: true, // Use false if debugging needed
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }
    return browser;
}

// Domain Resolution Strategy
const DEFAULT_DOMAIN = 'https://1tamilmv.do';
let currentDomain = DEFAULT_DOMAIN;

async function resolve1TamilMVDomain() {
    // For now, trust the hardcoded domain as it's user-supplied and verified working
    currentDomain = DEFAULT_DOMAIN;
    console.log(`[Connector] Using domain: ${currentDomain}`);
    return currentDomain;
}

// SEARCH API: Live search on 1TamilMV
app.get('/api/search', async (req, res) => {
    // Resolve domain first (allow override)
    let domain = req.query.domain || await resolve1TamilMVDomain();
    // Ensure protocol
    if (!domain.startsWith('http')) domain = 'https://' + domain;
    // Strip trailing slash
    if (domain.endsWith('/')) domain = domain.slice(0, -1);

    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query required' });

    console.log(`[Connector] Searching for: "${query}" on ${domain}`);
    let page = null;

    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        // Set realistic headers
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Try multiple search URL patterns (site may have changed)
        const searchUrls = [
            `${domain}/index.php?/search/&q=${encodeURIComponent(query)}&type=forums_topic`,
            `${domain}/index.php?/search/?q=${encodeURIComponent(query)}`,
            `${domain}/search/?q=${encodeURIComponent(query)}`
        ];

        let results = [];

        for (const searchUrl of searchUrls) {
            console.log(`[Connector] Trying: ${searchUrl}`);
            try {
                await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });

                // Wait for results
                try {
                    await page.waitForSelector('.ipsStreamItem_title, .ipsDataItem_title, h4.ipsDataItem_title', { timeout: 10000 });
                } catch (e) {
                    console.log('[Connector] No results selector found, trying next pattern...');
                    continue;
                }

                // Extract results - try multiple selectors
                results = await page.evaluate(() => {
                    // Try different possible structures
                    let items = document.querySelectorAll('.ipsStreamItem');
                    if (items.length === 0) items = document.querySelectorAll('.ipsDataItem');
                    if (items.length === 0) items = document.querySelectorAll('[data-controller="core.front.core.searchResult"]');

                    return Array.from(items).map(item => {
                        const titleEl = item.querySelector('.ipsStreamItem_title a, .ipsDataItem_title a, h4 a');
                        const metaEl = item.querySelector('.ipsStreamItem_meta, .ipsDataItem_meta');

                        if (!titleEl) return null;

                        return {
                            title: titleEl.innerText.trim(),
                            link: titleEl.href,
                            id: titleEl.href.match(/topic\/(\d+)-/)?.[1] || null,
                            date: metaEl ? metaEl.innerText.trim() : ''
                        };
                    }).filter(i => i !== null);
                });

                if (results.length > 0) {
                    console.log(`[Connector] Success! Found ${results.length} results`);
                    break;
                }
            } catch (e) {
                console.log(`[Connector] URL pattern failed: ${e.message}`);
            }
        }

        // FALLBACK: Google Search
        if (results.length === 0) {
            console.log('[Connector] Direct search failed/empty. Trying Google Fallback...');
            try {
                const googleQuery = `site:${domain.replace('https://', '')} ${query}`;
                const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`;
                console.log(`[Connector] Google Fallback: ${googleUrl}`);

                await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                results = await page.evaluate((currentDomain) => {
                    const items = document.querySelectorAll('.g');
                    return Array.from(items).map(item => {
                        const titleEl = item.querySelector('h3');
                        const linkEl = item.querySelector('a');

                        if (!titleEl || !linkEl) return null;

                        const link = linkEl.href;
                        // verify it belongs to the domain and is a topic
                        if (!link.includes('topic/')) return null;

                        return {
                            title: titleEl.innerText.trim(),
                            link: link,
                            id: link.match(/topic\/(\d+)-/)?.[1] || null,
                            date: 'Unknown'
                        };
                    }).filter(i => i !== null);
                }, domain);

                console.log(`[Connector] Google Fallback found ${results.length} results`);
            } catch (e) {
                console.error(`[Connector] Google Fallback failed: ${e.message}`);
            }
        }

        console.log(`[Connector] Found ${results.length} results. Fetching magnets...`);

        // ADVANCED: Fetch magnet links from each result (parallel, max 3)
        const resultsWithMagnets = await Promise.all(
            results.slice(0, 5).map(async (result) => { // Limit to first 5 for speed
                try {
                    const detailPage = await browser.newPage();
                    await detailPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                    await detailPage.goto(result.link, { waitUntil: 'domcontentloaded', timeout: 15000 });

                    const magnetData = await detailPage.evaluate(() => {
                        const magnets = [];
                        // 1TamilMV usually lists magnets in a consistent container or pattern.
                        // We'll look for all magnet links and try to find nearby text for size/quality.
                        const links = document.querySelectorAll('a[href^="magnet:?"]');

                        links.forEach(link => {
                            // Helper to find size/quality in nearby text nodes
                            // Often structure is: <span>720p - 1.4GB</span> <a href="magnet:...">Magnetic Link</a>
                            // Or inside a specific formatting.

                            // Strategy: Walk up to common parent (usually a p or div) or look at previous siblings
                            let label = 'Unknown';
                            let foundSize = null;

                            // Try to find text in the paragraph or container
                            // 2. Advanced: Look at preceding text/elements
                            // Pattern: Text description ending with colon (:), followed by Magnet link
                            // Or: Text description -> Line break -> Magnet link

                            // Traverse previous siblings or text nodes
                            let current = link;
                            let limit = 5; // Look back at most 5 elements
                            while (limit > 0 && current) {
                                current = current.previousSibling || current.parentElement;
                                if (!current) break;

                                const text = current.innerText || current.textContent || '';
                                if (!text || text.trim().length < 5) { limit--; continue; }

                                // Look for key indicators (resolution, size, HEVC, etc)
                                if (text.match(/(2160p|1080p|720p|4K|HQ|HEVC|x264|x265)/i)) {
                                    // Found a likely description block

                                    // Extract the full relevant line e.g. "Mask (2025) Tamil ... 2.3GB"
                                    // It might be multiline, take the line closest to our link?
                                    // Or just take the whole text if it's short

                                    // Try to capture specific attributes first
                                    const qualities = text.match(/(4K|2160p|1080p|720p|HQ|HDRip|WEB-DL|BluRay)/gi) || [];
                                    const codecs = text.match(/(HEVC|x264|x265|AVC|H\.264|H\.265)/gi) || [];
                                    const audio = text.match(/(DD\+?5\.1|AAC\s*2\.0|Dolby|Atmos)/gi) || [];
                                    const sizeMatch = text.match(/(\d+\.?\d*)\s*(GB|MB)/i);

                                    const parts = [
                                        ...new Set(qualities),
                                        ...new Set(codecs),
                                        sizeMatch ? sizeMatch[0] : null
                                    ].filter(Boolean);

                                    if (parts.length > 0) {
                                        label = parts.join(' - ');
                                        if (sizeMatch) foundSize = sizeMatch[0];
                                        // If size is found, update it
                                        // If user wants FULL string, maybe we can try to clean the raw text?
                                        // The user text has unwanted "www.1TamilMV.LC - " prefixes sometimes.

                                        // Let's settle for a generated label: "4K - HEVC - 2.3GB"
                                        // Or better, if we find specific size, use that as primary label in UI
                                    }

                                    break; // Stop looking once found
                                }
                                limit--;
                            }

                            magnets.push({
                                link: link.href,
                                title: label || 'Standard',
                                size: label.match(/(\d+\.?\d*)\s*(GB|MB|GiB|MiB)/i)?.[0] || 'Unknown'
                            });
                        });

                        // Deduplicate by link
                        const unique = [];
                        const seen = new Set();
                        for (const m of magnets) {
                            if (!seen.has(m.link)) {
                                seen.add(m.link);
                                unique.push(m);
                            }
                        }

                        return unique.length > 0 ? unique : [{ link: null, title: 'None', size: null }];
                    });

                    await detailPage.close();

                    return {
                        ...result,
                        magnet: magnetData[0]?.link || null, // Primary magnet for backward compatibility
                        size: magnetData[0]?.size || null,
                        magnets: magnetData, // New array of all magnets
                        source: '1tamilmv'
                    };
                } catch (e) {
                    return { ...result, magnet: null, size: null, source: '1tamilmv' };
                }
            })
        );

        console.log(`[Connector] Magnets fetched for ${resultsWithMagnets.filter(r => r.magnet).length} results`);
        res.json({ success: true, results: resultsWithMagnets });

    } catch (err) {
        console.error('[Connector] Search Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (page) await page.close();
    }
});

// DETAILS API: Extract magnets and streaming info from a topic
app.get('/api/details', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });

    console.log(`[Connector] Scraping details: ${url}`);
    let page = null;

    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract data
        const data = await page.evaluate(() => {
            // Find Magnet Links
            const magnetLinks = Array.from(document.querySelectorAll('a[href^="magnet:?"]'))
                .map(a => ({
                    link: a.href,
                    text: a.innerText || 'Magnet Link'
                }));

            // Find Watch/Stream Links (strmup, etc.)
            // Look for links that say [WATCH] or are in the post content
            const allLinks = Array.from(document.querySelectorAll('.cPost_contentWrap a'));
            const watchLinks = allLinks
                .filter(a => a.href.includes('strmup') || a.href.includes('vidnest') || a.innerText.includes('WATCH'))
                .map(a => a.href);

            // Try to find a poster
            const poster = document.querySelector('.cPost_contentWrap img')?.src || '';

            // Extract IMDB ID
            let imdbId = '';
            const imdbLink = Array.from(document.querySelectorAll('a[href*="imdb.com/title/tt"]'))[0];
            if (imdbLink) {
                const match = imdbLink.href.match(/tt\d+/);
                if (match) imdbId = match[0];
            } else {
                // Fallback: search text for "IMDB"
                const text = document.body.innerText;
                const match = text.match(/imdb\.com\/title\/(tt\d+)/i);
                if (match) imdbId = match[1];
            }

            return { magnets: magnetLinks, watch: watchLinks[0] || null, poster, imdbId, title: document.title };
        });

        // 2. METADATA ENHANCER (Advanced Tech)
        // If no IMDB ID found, use multiple fallback strategies
        if (!data.imdbId) {
            // Smart Title Extraction: Remove year, resolution, codec, language, site info
            let cleanTitle = data.title
                .split('-')[0]  // Remove site name suffix
                .replace(/\([^\)]*\)/g, '')  // Remove parenthetical like (2025)
                .replace(/\[[^\]]*\]/g, '')  // Remove brackets like [Tamil]
                .replace(/(Tamil|Telugu|Hindi|Malayalam|Kannada|English)/gi, '')  // Remove language names
                .replace(/(WEB|WEBRip|HDRip|DVDRip|BluRay|4K|1080p|720p|HEVC|x264|x265|AVC|DD|AC3|AAC|HD|UHD|SDRip|ZEE5|Netflix|Amazon|Prime|Hotstar|AHA)/gi, '')  // Remove format/source info
                .replace(/\s+/g, ' ')  // Collapse multiple spaces
                .trim();

            // Extract just the movie name (first few words, stop at numbers/special chars)
            const nameMatch = cleanTitle.match(/^([A-Za-z\s]+)/);
            if (nameMatch) cleanTitle = nameMatch[1].trim();

            console.log(`[Connector] Missing IMDB ID. Cleaned title for lookup: "${cleanTitle}"`);

            // STRATEGY 1: TMDB API (Most Reliable - Free Tier)
            try {
                const tmdbApiKey = 'c6e0fd9c2aed1aae65e23a8ceef0f2f5'; // Public demo key

                // Step 1: Search for the movie
                const searchRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(cleanTitle)}`);
                const searchData = await searchRes.json();

                if (searchData.results && searchData.results.length > 0) {
                    const tmdbId = searchData.results[0].id;
                    console.log(`[Connector] TMDB Found: "${searchData.results[0].title}" (ID: ${tmdbId})`);

                    // Step 2: Get external IDs (including IMDB)
                    const extRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${tmdbApiKey}`);
                    const extData = await extRes.json();

                    if (extData.imdb_id) {
                        console.log(`[Connector] ✅ TMDB Success: IMDB ID = ${extData.imdb_id}`);
                        data.imdbId = extData.imdb_id;
                    }
                }
            } catch (tmdbErr) {
                console.log('[Connector] TMDB API failed:', tmdbErr.message);
            }

            // STRATEGY 2: Google Search (Fallback)
            if (!data.imdbId) {
                try {
                    console.log(`[Connector] Trying Google Search...`);
                    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(cleanTitle + ' imdb')}`, { waitUntil: 'domcontentloaded' });

                    const googleImdb = await page.evaluate(() => {
                        const link = document.querySelector('a[href*="imdb.com/title/tt"]');
                        return link ? link.href.match(/tt\d+/)?.[0] : null;
                    });

                    if (googleImdb) {
                        console.log(`[Connector] ✅ Google Success: ${googleImdb}`);
                        data.imdbId = googleImdb;
                    }
                } catch (e) {
                    console.log('[Connector] Google Search failed.');
                }
            }

            // STRATEGY 3: DuckDuckGo (Final Fallback)
            if (!data.imdbId) {
                try {
                    console.log(`[Connector] Trying DuckDuckGo...`);
                    await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanTitle + ' imdb')}`, { waitUntil: 'domcontentloaded' });
                    const ddgImdb = await page.evaluate(() => {
                        const link = document.querySelector('a.result__a[href*="imdb.com/title/tt"]');
                        return link ? link.href.match(/tt\d+/)?.[0] : null;
                    });
                    if (ddgImdb) {
                        console.log(`[Connector] ✅ DuckDuckGo Success: ${ddgImdb}`);
                        data.imdbId = ddgImdb;
                    }
                } catch (err) {
                    console.log('[Connector] DuckDuckGo failed.');
                }
            }

            if (!data.imdbId) {
                console.log('[Connector] ⚠️ All metadata enhancements failed. Cloud streaming unavailable.');
            }
        }

        res.json({ success: true, data });

    } catch (err) {
        console.error('[Connector] Details Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (page) await page.close();
    }
});

// SNIFF API: Deep Packet Inspection to extract raw .m3u8
app.get('/api/sniff', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });

    console.log(`[Connector] Sniffing stream: ${url}`);
    let page = null;
    let streamUrl = null;

    try {
        const browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // Enable Request Interception
        await page.setRequestInterception(true);

        page.on('request', request => {
            const reqUrl = request.url();
            // Look for master playlist or mp4
            if ((reqUrl.includes('.m3u8') || reqUrl.includes('.mp4')) && !streamUrl) {
                console.log(`[Connector] CAPTURED STREAM: ${reqUrl}`);
                streamUrl = reqUrl;
            }
            request.continue();
        });

        // Navigate and wait for player to trigger
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Sometimes need to click play to trigger network
        try {
            await page.evaluate(() => {
                // Try multiple common player play button selectors
                const selectors = [
                    '.jw-display-icon-container',
                    '.jw-icon-playback',
                    'video',
                    '.play-button',
                    '#play-button',
                    'button[class*="play"]',
                    '.vjs-big-play-button'
                ];

                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        el.click();
                        console.log('Clicked: ' + sel);
                        return; // Click first match
                    }
                }
            });
        } catch (e) { }

        // Wait a bit for the network request to fire
        await new Promise(r => setTimeout(r, 5000));

        if (streamUrl) {
            // Encode the stream URL for the proxy
            const proxyUrl = `http://localhost:3007/api/proxy-hls?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(url)}`;
            res.json({ success: true, streamUrl: proxyUrl, originalUrl: streamUrl });
        } else {
            console.log('[Connector] Stream sniff timed out');
            res.status(404).json({ error: 'Stream not found' });
        }

    } catch (err) {
        console.error('[Connector] Sniff Error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (page) await page.close();
    }
});

// PROXY HLS: Rewrite m3u8 to point to local proxy
app.get('/api/proxy-hls', async (req, res) => {
    const url = req.query.url;
    const referer = req.query.referer;

    if (!url) return res.status(400).send('URL required');

    try {
        console.log(`[Proxy] Fetching Playlist: ${url}`);

        // Fetch original m3u8
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': referer || new URL(url).origin
            }
        });

        let m3u8 = await response.text();

        // Resolve base URL for relative paths
        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

        // Rewrite chunk URLs (lines not starting with #) to go through proxy-ts
        const lines = m3u8.split('\n');
        const rewrittenLines = lines.map(line => {
            if (line.trim() && !line.startsWith('#')) {
                // Determine absolute URL of the chunk
                const chunkUrl = line.startsWith('http') ? line : baseUrl + line;
                return `http://localhost:3007/api/proxy-ts?url=${encodeURIComponent(chunkUrl)}&referer=${encodeURIComponent(referer || '')}`;
            }
            return line;
        });

        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(rewrittenLines.join('\n'));

    } catch (err) {
        console.error('[Proxy] HLS Error:', err.message);
        res.status(500).send('Proxy Error');
    }
});

// PROXY TS: Serve video chunks with correct headers
app.get('/api/proxy-ts', async (req, res) => {
    const url = req.query.url;
    const referer = req.query.referer;

    if (!url) return res.status(400).send('URL required');

    try {
        // console.log(`[Proxy] Fetching Chunk: ${url}`); // Verbose logging disabled

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': referer || new URL(url).origin
            }
        });

        // Pipe the video data
        res.set('Content-Type', 'video/mp2t');
        res.set('Access-Control-Allow-Origin', '*');

        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));

    } catch (err) {
        console.error('[Proxy] TS Error:', err.message);
        res.status(500).send('Chunk Error');
    }
});

app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║   1TAMILMV LIVE CONNECTOR (MCP)       ║
    ║   Port: ${PORT}                           ║
    ║   /api/search?q=...                   ║
    ║   /api/details?url=...                ║
    ╚═══════════════════════════════════════╝
    `);
});
