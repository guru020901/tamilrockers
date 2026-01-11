import { NextResponse } from 'next/server';
import { getBrowser } from '@/lib/browser';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    console.log(`[API/TamilMV/Details] Scraping details: ${url}`);
    let browser = null;
    let page = null;

    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const data = await page.evaluate(() => {
            const magnetLinks: any[] = [];
            const magnetsNodes = Array.from(document.querySelectorAll('a[href^="magnet:?"]'));
            magnetsNodes.forEach((a: any) => magnetLinks.push({ link: a.href, text: a.innerText }));

            if (magnetLinks.length === 0) {
                const html = document.body.innerHTML;
                const matches = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[a-zA-Z0-9=&%\-._]*/g);
                if (matches) matches.forEach(m => magnetLinks.push({ link: m, text: 'Text Magnet' }));
            }
            const poster = document.querySelector('.cPost_contentWrap img')?.getAttribute('src') || '';

            // IMDB
            let imdbId = '';
            const imdbLink = Array.from(document.querySelectorAll('a[href*="imdb.com/title/tt"]'))[0] as HTMLAnchorElement;
            if (imdbLink) imdbId = imdbLink.href.match(/tt\d+/)?.[0] || '';
            else {
                const match = document.body.innerText.match(/imdb\.com\/title\/(tt\d+)/i);
                if (match) imdbId = match[1];
            }

            return { magnets: magnetLinks, poster, imdbId, title: document.title, watch: false };
        });

        return NextResponse.json({ success: true, data });

    } catch (err: any) {
        console.error('[API/TamilMV/Details] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
}
