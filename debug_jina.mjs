import fetch from 'node-fetch';

const TARGET = 'https://www.1tamilblasters.business/?s=leo';
const JINA_URL = `https://r.jina.ai/${TARGET}`;

async function testJina() {
    console.log(`[Debug] Testing Jina Reader Proxy: ${JINA_URL}`);
    try {
        const response = await fetch(JINA_URL, {
            headers: {
                'Authorization': 'Bearer jina_test', // Free tier often works without headers or with simple ones
                'User-Agent': 'Mozilla/5.0'
            }
        });

        console.log(`[Debug] Status: ${response.status}`);
        const text = await response.text();
        console.log(`[Debug] Content Length: ${text.length}`);
        console.log('[Debug] Preview:');
        console.log(text.substring(0, 1000));

        // Check for content
        if (text.includes('Leo')) {
            console.log('[Debug] ✅ Jina successfully retrieved content!');
        } else {
            console.log('[Debug] ❌ Content missing or blocked.');
        }

    } catch (e) {
        console.error('[Debug] Request Failed:', e.message);
    }
}

testJina();
