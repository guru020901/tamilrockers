import fetch from 'node-fetch';

const DOMAIN = 'https://www.1tamilblasters.business';

async function testScraper() {
    console.log(`[Debug] Testing ${DOMAIN}...`);
    try {
        const response = await fetch(`${DOMAIN}/?s=leo`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log(`[Debug] Status: ${response.status}`);
        const html = await response.text();
        console.log(`[Debug] HTML Length: ${html.length}`);

        if (html.includes('Just a moment') || html.includes('Cloudflare')) {
            console.error('[Debug] ❌ Blocked by Cloudflare!');
            return;
        }

        // Test Regex
        const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi;
        const matches = html.match(articlePattern);
        console.log(`[Debug] Article Matches: ${matches ? matches.length : 0}`);

        if (!matches) {
            console.log('[Debug] Dumping first 500 chars:');
            console.log(html.substring(0, 500));
        }

    } catch (e) {
        console.error('[Debug] Request Failed:', e.message);
    }
}

testScraper();
