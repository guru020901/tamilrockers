import puppeteer from 'puppeteer-core';

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
                args: chromium.default.args,
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
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            console.log('[Browser] Launched locally with puppeteer');
        } catch (e: any) {
            console.log("Local puppeteer fallback failed:", e.message);
            browser = await puppeteer.launch({
                channel: 'chrome',
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            console.log('[Browser] Launched locally with puppeteer-core');
        }
    }

    return browser;
}
