import { NextResponse } from 'next/server';
import { getBrowser } from '@/lib/browser';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    console.log(`[API/TamilBlasters/Details] Fetching: "${url}"`);
    let browser = null;
    let page = null;

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const data = await page.evaluate(() => {
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

            const posterEl = document.querySelector('.nv-post-thumbnail-wrap img') as HTMLImageElement | null;
            const poster = posterEl?.src || null;

            // Extract Watch/Stream URL (CyberVynx etc)
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

        return NextResponse.json({ success: true, data });

    } catch (err: any) {
        console.error('[API/TamilBlasters/Details] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
}
