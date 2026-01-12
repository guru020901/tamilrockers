/**
 * 🔍 1TamilBlasters Structure Analyzer
 * Fetches a real series page and analyzes how episodes are structured
 */

const TARGET_URL = 'https://www.1tamilblasters.business/surely-tomorrow-2025-s01ep01-tam-tel-hin-mal-eng/';

async function analyze() {
    console.log('🔍 Fetching:', TARGET_URL);

    try {
        const res = await fetch(TARGET_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const html = await res.text();
        console.log('\n📊 Page Size:', html.length, 'characters');

        // 1. Find Episode markers
        console.log('\n--- EPISODE MARKERS ---');
        const episodePatterns = [
            { name: 'Episode – X', pattern: /Episode\s*[-–]\s*(\d+)/gi },
            { name: 'EP-X', pattern: /\bEP[-\s]*(\d+)/gi },
            { name: 'S01EP01', pattern: /S\d+EP\d+/gi },
        ];

        for (const { name, pattern } of episodePatterns) {
            const matches = html.match(pattern);
            console.log(`${name}: ${matches ? matches.length : 0} matches`);
            if (matches) {
                console.log('  Examples:', matches.slice(0, 5).join(', '));
            }
        }

        // 2. Find iframes (video embeds)
        console.log('\n--- VIDEO EMBEDS (iframes) ---');
        const iframePattern = /<iframe[^>]*src="([^"]+)"/gi;
        const iframes = [];
        let iframeMatch;
        while ((iframeMatch = iframePattern.exec(html)) !== null) {
            iframes.push(iframeMatch[1]);
        }
        console.log(`Found ${iframes.length} iframes:`);
        iframes.forEach((src, i) => console.log(`  ${i + 1}. ${src.substring(0, 80)}...`));

        // 3. Find torrent links
        console.log('\n--- TORRENT LINKS ---');
        const torrentPattern = /<a[^>]*href="([^"]*\.torrent)"[^>]*>([^<]+)<\/a>/gi;
        const torrents = [];
        let torrentMatch;
        while ((torrentMatch = torrentPattern.exec(html)) !== null) {
            torrents.push({ url: torrentMatch[1].substring(0, 60), text: torrentMatch[2].substring(0, 50) });
        }
        console.log(`Found ${torrents.length} torrent links`);
        torrents.slice(0, 10).forEach((t, i) => console.log(`  ${i + 1}. ${t.text}`));

        // 4. Find magnet links
        console.log('\n--- MAGNET LINKS ---');
        const magnetPattern = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+/gi;
        const magnets = html.match(magnetPattern);
        console.log(`Found ${magnets ? magnets.length : 0} magnet links`);

        // 5. Analyze structure - find section dividers
        console.log('\n--- STRUCTURE ANALYSIS ---');
        const h2Tags = html.match(/<h2[^>]*>([^<]+)<\/h2>/gi);
        console.log(`H2 tags: ${h2Tags ? h2Tags.length : 0}`);
        if (h2Tags) h2Tags.slice(0, 5).forEach(t => console.log(`  - ${t}`));

        const h3Tags = html.match(/<h3[^>]*>([^<]+)<\/h3>/gi);
        console.log(`H3 tags: ${h3Tags ? h3Tags.length : 0}`);
        if (h3Tags) h3Tags.slice(0, 5).forEach(t => console.log(`  - ${t}`));

        // 6. Check for episode-specific sections
        console.log('\n--- EPISODE SECTIONS ---');
        // Look for patterns like <p>Episode – 11</p> followed by iframe
        const episodeSectionPattern = /Episode\s*[-–]\s*(\d+)[^<]*[\s\S]{0,500}<iframe[^>]*src="([^"]+)"/gi;
        let epMatch;
        const episodeSections = [];
        while ((epMatch = episodeSectionPattern.exec(html)) !== null) {
            episodeSections.push({ episode: epMatch[1], iframe: epMatch[2].substring(0, 60) });
        }
        console.log(`Found ${episodeSections.length} episode sections with iframes:`);
        episodeSections.forEach(s => console.log(`  Episode ${s.episode}: ${s.iframe}...`));

        // 7. Save raw HTML for manual inspection
        const fs = await import('fs');
        fs.writeFileSync('debug_1tamilblasters_raw.html', html);
        console.log('\n✅ Saved raw HTML to debug_1tamilblasters_raw.html');

    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

analyze();
