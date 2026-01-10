import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());

const PORT = 3006;

// This proxy extracts clean video URLs from ad-heavy streaming sites
// It uses regex/fetch to find the actual .m3u8 or .mp4 source

app.get('/extract', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL required' });

    console.log(`[AdBlock Proxy] Extracting from: ${url}`);

    try {
        // Fetch the player page HTML
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const html = await response.text();

        // Common patterns for video sources in streaming players
        const patterns = [
            /file:\s*["']([^"']+\.m3u8[^"']*)/i,      // HLS streams
            /source:\s*["']([^"']+\.m3u8[^"']*)/i,
            /sources:\s*\[\s*\{[^}]*file:\s*["']([^"']+)/i,
            /videoUrl\s*=\s*["']([^"']+)/i,
            /"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/i,
            /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g,     // Direct HLS URL
            /https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g       // Direct MP4 URL
        ];

        let videoUrl = null;

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                videoUrl = match[1] || match[0];
                break;
            }
        }

        if (videoUrl) {
            console.log(`[AdBlock Proxy] Found video: ${videoUrl.substring(0, 50)}...`);
            return res.json({ success: true, videoUrl, type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4' });
        }

        // Fallback: Try to find any video-related URL
        const allUrls = html.match(/https?:\/\/[^"'\s<>]+/g) || [];
        const videoUrls = allUrls.filter(u =>
            u.includes('.m3u8') ||
            u.includes('.mp4') ||
            u.includes('video') ||
            u.includes('stream')
        );

        if (videoUrls.length > 0) {
            console.log(`[AdBlock Proxy] Fallback found: ${videoUrls[0].substring(0, 50)}...`);
            return res.json({ success: true, videoUrl: videoUrls[0], type: 'unknown' });
        }

        console.log('[AdBlock Proxy] No video URL found');
        res.json({ success: false, error: 'Video URL not found in page' });

    } catch (err) {
        console.error('[AdBlock Proxy] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'online', service: 'AdBlock Video Proxy' });
});

// Proxy endpoint - fetches page, strips ads, serves clean HTML
app.get('/proxy', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send('URL required');

    console.log(`[AdBlock Proxy] Proxying: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': new URL(url).origin
            }
        });
        let html = await response.text();

        // Remove common ad scripts and elements
        const adPatterns = [
            /<script[^>]*(?:ads|advert|analytics|tracking|popup|banner|sponsor)[^>]*>[\s\S]*?<\/script>/gi,
            /<script[^>]*googletag[^>]*>[\s\S]*?<\/script>/gi,
            /<script[^>]*doubleclick[^>]*>[\s\S]*?<\/script>/gi,
            /<script[^>]*adsbygoogle[^>]*>[\s\S]*?<\/script>/gi,
            /<ins[^>]*adsbygoogle[^>]*>[\s\S]*?<\/ins>/gi,
            /<div[^>]*(?:ad-container|ad-wrapper|ad-banner|popup-overlay)[^>]*>[\s\S]*?<\/div>/gi,
            /<iframe[^>]*(?:ads|banner|pop)[^>]*>[\s\S]*?<\/iframe>/gi,
            /onclick\s*=\s*["'][^"']*(?:window\.open|popup)[^"']*["']/gi,
            /<a[^>]*target\s*=\s*["']_blank["'][^>]*>[\s\S]*?<\/a>/gi, // Remove external links
        ];

        for (const pattern of adPatterns) {
            html = html.replace(pattern, '');
        }

        // Inject CSS to hide remaining ad elements
        const adBlockCSS = `
            <style>
                [class*="ad-"], [class*="ads-"], [class*="banner"], 
                [class*="popup"], [class*="overlay"], [id*="ad-"], 
                [id*="ads-"], [id*="popup"], [id*="overlay"],
                .advertisement, .sponsored, .promo,
                iframe:not([src*="player"]):not([src*="embed"]) { 
                    display: none !important; 
                    visibility: hidden !important;
                    height: 0 !important;
                    width: 0 !important;
                }
                body { overflow: auto !important; }
            </style>
        `;
        html = html.replace('</head>', adBlockCSS + '</head>');

        // Fix relative URLs
        const baseUrl = new URL(url).origin;
        html = html.replace(/src="\//g, `src="${baseUrl}/`);
        html = html.replace(/href="\//g, `href="${baseUrl}/`);

        res.setHeader('Content-Type', 'text/html');
        res.send(html);

    } catch (err) {
        console.error('[AdBlock Proxy] Proxy error:', err.message);
        res.status(500).send('Proxy error: ' + err.message);
    }
});

app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║   AD-BLOCK VIDEO EXTRACTION PROXY     ║
    ║   Port: ${PORT}                           ║
    ║   /extract?url=... - Get video URL    ║
    ║   /proxy?url=...   - Ad-free page     ║
    ╚═══════════════════════════════════════╝
    `);
});
