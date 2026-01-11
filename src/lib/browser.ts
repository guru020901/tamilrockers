import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Helper to get a browser instance optimized for runtime (Vercel vs Local)
export async function getBrowser() {
    let browser;

    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
        // Vercel / Lambda Environment
        browser = await puppeteer.launch({
            args: (chromium as any).args,
            defaultViewport: { width: 1280, height: 720 },
            executablePath: await (chromium as any).executablePath(),
            headless: (chromium as any).headless,
            ignoreHTTPSErrors: true,
        } as any);
    } else {
        // Local Development Environment
        try {
            // Try to find local chrome or use a fixed path if known. 
            const localPuppeteer = require('puppeteer');
            browser = await localPuppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        } catch (e) {
            console.log("Local puppeteer fallback failed, trying core with default paths...");
            browser = await puppeteer.launch({
                channel: 'chrome',
                headless: true, // Use boolean for core if "new" is problematic
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
    }

    return browser;
}
