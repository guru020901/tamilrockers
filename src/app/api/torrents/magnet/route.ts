import { NextResponse } from 'next/server';
import { getBrowser } from '@/lib/browser';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const source = searchParams.get('source');

    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    if (source !== '1337x') {
        return NextResponse.json({ error: 'Only 1337x requires magnet fetch' }, { status: 400 });
    }

    let browser = null;
    let page = null;
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

        const magnet = await page.evaluate(() => {
            const magnetLink = document.querySelector('a[href^="magnet:"]') as HTMLAnchorElement;
            return magnetLink ? magnetLink.href : null;
        });

        if (magnet) return NextResponse.json({ success: true, magnet });
        else return NextResponse.json({ error: 'Magnet not found' }, { status: 404 });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    } finally {
        if (page) await page.close();
        if (browser) await browser.close();
    }
}
