const fs = require('fs');
const path = require('path');

async function fetchHome() {
    try {
        const res = await fetch('https://www.1tamilmv.lc/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = await res.text();
        fs.writeFileSync('home.html', html);
        console.log('Saved home.html');
    } catch (e) {
        console.error(e);
    }
}

fetchHome();
