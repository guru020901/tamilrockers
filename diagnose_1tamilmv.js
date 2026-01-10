const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const domain = 'https://1tamilmv.do';
    const query = 'Leo';

    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`Navigating to ${domain}...`);
        await page.goto(domain, { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('Homepage loaded.');
        await page.screenshot({ path: 'debug_homepage.png' });

        const searchUrl = `${domain}/index.php?/search/&q=${encodeURIComponent(query)}&type=forums_topic`;
        console.log(`Searching: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });

        console.log('Search page loaded.');
        await page.screenshot({ path: 'debug_search_results.png' });

        const content = await page.content();
        fs.writeFileSync('debug_search.html', content);
        console.log('HTML saved to debug_search.html');

        // Evaluate selectors
        const count = await page.evaluate(() => {
            const items = document.querySelectorAll('.ipsStreamItem, .ipsDataItem, [data-controller="core.front.core.searchResult"]');
            return items.length;
        });

        console.log(`Found ${count} result items.`);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
})();
