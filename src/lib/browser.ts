import puppeteer from 'puppeteer-core';
import { USER_AGENT } from './config';

// Helper to get a browser instance optimized for runtime (Vercel vs Local)
export async function getBrowser() {
    let browser;

    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
        // Vercel / Lambda Environment - Load chromium dynamically
        try {
            // Dynamic import to avoid build-time issues
            const chromium = await import('@sparticuz/chromium');

            const executablePath = await chromium.default.executablePath();
            console.log('[Browser] Chromium path:', executablePath);

            browser = await puppeteer.launch({
                args: [...chromium.default.args, `--user-agent=${USER_AGENT}`],
                defaultViewport: { width: 1280, height: 720 },
                executablePath: executablePath,
                headless: true,
            } as any);

            console.log('[Browser] Launched successfully on Vercel');
        } catch (chromiumError: any) {
            console.error('[Browser] Chromium launch failed:', chromiumError.message);
            throw new Error('Chromium failed to launch: ' + chromiumError.message);
        }
    } else {
        // Local Development Environment
        try {
            // Try to find local chrome or use a fixed path if known. 
            const localPuppeteer = require('puppeteer');
            browser = await localPuppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox', `--user-agent=${USER_AGENT}`]
            });
            console.log('[Browser] Launched locally with puppeteer');
        } catch (e: any) {
            console.log("Local puppeteer fallback failed:", e.message);
            browser = await puppeteer.launch({
                channel: 'chrome',
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', `--user-agent=${USER_AGENT}`]
            });
            console.log('[Browser] Launched locally with puppeteer-core');
        }
    }

    return browser;
}

export async function scrapeWithPuppeteer(url: string, referer?: string) {
    const browser = await getBrowser();
    try {
        const page = await browser.newPage();

        // Stealth/Browser consistency
        await page.setUserAgent(USER_AGENT);
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': referer || url
        });

        // Navigate with robust waiting
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Cloudflare/Turnstile Solver
        try {
            // Find Turnstile/Cloudflare iframe
            const cfSelector = 'iframe[src*="cloudflare"], iframe[src*="turnstile"], #challenge-stage iframe';
            const frameElement = await page.waitForSelector(cfSelector, { timeout: 5000 });

            if (frameElement) {
                console.log('[Browser] Cloudflare/Turnstile detected. Attempting to solve...');
                const frame = await frameElement.contentFrame();
                if (frame) {
                    // Try to find the checkbox inside the iframe
                    const box = await frame.waitForSelector('.ctp-checkbox-label, .cb-lb, input[type="checkbox"]', { timeout: 3000 });
                    if (box) {
                        await box.click();
                        console.log('[Browser] Clicked verification checkbox. Waiting...');
                        // Wait for navigation or challenge success (network idle)
                        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => console.log('[Browser] Navigation timeout (challenge might be verified inplace)'));
                    }
                }
            }
        } catch (e) {
            // No challenge detected or timed out - verify content isn't a block page
            // console.log('[Browser] No active challenge detected or clickable.');
        }

        // Get content and cookies
        const content = await page.content();
        const cookies = await page.cookies();

        // Format cookies for header
        const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

        return {
            html: content,
            cookies: cookieString,
            ua: USER_AGENT
        };
    } catch (e) {
        console.error('[Browser] Scrape failed:', e);
        throw e;
    } finally {
        // Keep browser alive in dev? No, heavy.
        if (browser) await browser.close();
    }
}
