import { NextResponse } from 'next/server';
import { fetchHtmlWithBypass } from '@/lib/proxy';
import { getDomain } from '@/lib/config';

/**
 * 🚀 ADVANCED 1TamilBlasters Details Scraper v5 (Tokenizer Edition)
 * 
 * Architecture Analysis (1TamilBlasters):
 * - Structure is interleaved: Episode markers, Player labels, and Iframes appear in reading order.
 * - Series: "Episode 01" -> "Player 01" -> Iframe -> "Player 02" -> Iframe -> "Episode 02" ...
 * - Movies: "Player 01" -> Iframe -> "Player 02" -> Iframe ...
 * 
 * Strategy: Tokenize HTML (mark positions of Episodes, Players, Iframes), sort by index, 
 * and use a State Machine to group them contextually.
 */

interface TorrentLink {
    quality: string;
    size: string;
    link: string;
    filename: string;
}

interface Player {
    number: number;
    url: string;
}

interface Episode {
    number: string;
    title: string;
    players: Player[];
    torrents: TorrentLink[];
}

interface SeriesMetadata {
    seriesName?: string;
    originalTitle?: string;
    director?: string;
    plotSummary?: string;
    languages?: string;
    year?: string;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
    }

    console.log(`[API/TamilBlasters/Details] Fetching: ${targetUrl}`);

    try {
        const domain = await getDomain('1tamilblasters');
        const html = await fetchHtmlWithBypass(targetUrl, domain);

        // --- EXTRACT SERIES METADATA ---
        const metadata: SeriesMetadata = {};
        const seriesNameMatch = html.match(/Series\s*Name:\s*<\/strong>\s*([^<]+)/i) ||
            html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
            html.match(/<title>([^<|]+)/i);
        if (seriesNameMatch) metadata.seriesName = seriesNameMatch[1].trim();

        const originalTitleMatch = html.match(/Original\s*Title:\s*<\/strong>\s*([^<]+)/i);
        if (originalTitleMatch) metadata.originalTitle = originalTitleMatch[1].trim();

        const directorMatch = html.match(/Directed\s*by:\s*<\/strong>\s*([^<]+)/i);
        if (directorMatch) metadata.director = directorMatch[1].trim();

        const plotMatch = html.match(/Plot\s*Summary:\s*<\/p>\s*<p[^>]*>([^<]+)/i);
        if (plotMatch) metadata.plotSummary = plotMatch[1].trim();

        const yearMatch = html.match(/\((\d{4})\)/);
        if (yearMatch) metadata.year = yearMatch[1];

        // --- EXTRACT POSTER ---
        let poster = null;
        const posterPatterns = [
            /<img[^>]*class="[^"]*attachment-post-thumbnail[^"]*"[^>]*src="([^"]+)"/i,
            /<img[^>]*src="([^"]+)"[^>]*class="[^"]*wp-post-image[^"]*"/i,
            /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
        ];
        for (const pattern of posterPatterns) {
            const posterMatch = pattern.exec(html);
            if (posterMatch) {
                poster = posterMatch[1];
                break;
            }
        }

        // --- ROBUST TOKENIZER & STATE MACHINE PARSING ---
        // We identify "Tokens" in the HTML and process them in order to capture structure

        interface Token {
            type: 'EPISODE' | 'PLAYER' | 'IFRAME';
            index: number;
            value?: string;
        }

        const tokens: Token[] = [];

        // 1. Find Episode Tokens
        // Patterns: "Episode - 01", "EP01", "Episode 1", "S01EP01"
        // Note: HTML entities &#8211; (en-dash) and &ndash; are also handled
        const epPatterns = [
            /Episode\s*(?:[-–]|&#8211;|&ndash;|&#x2013;)\s*(\d+)/gi, // Episode – 17
            /\bEP[-\s]*(\d+)/gi,           // EP17, EP 17
            /Episode\s+(\d+)/gi,           // Episode 17
            /S\d+EP(\d+)/gi                // S01EP17
        ];
        for (const pattern of epPatterns) {
            let m;
            while ((m = pattern.exec(html)) !== null) {
                // Determine if this is likely a header
                tokens.push({ type: 'EPISODE', index: m.index, value: m[1].padStart(2, '0') });
            }
        }

        // 2. Find Player Tokens
        // Patterns: "Player: 01", "Player 02"
        const playerPattern = /Player[:.\s]*(\d+)/gi;
        let pm;
        while ((pm = playerPattern.exec(html)) !== null) {
            tokens.push({ type: 'PLAYER', index: pm.index, value: pm[1] });
        }

        // 3. Find Iframe Tokens (Robust: handles IFRAME/iframe, SRC/src, quoted/unquoted)
        const iframePattern = /<iframe[^>]*\s+src\s*=\s*["']?([^"'\s>]+)/gi;
        let im;
        while ((im = iframePattern.exec(html)) !== null) {
            const src = im[1];
            if (!src.includes('googlead') && !src.includes('facebook') && !src.includes('twitter')) {
                tokens.push({ type: 'IFRAME', index: im.index, value: src });
            }
        }

        // Sort tokens by position (Critical for order)
        tokens.sort((a, b) => a.index - b.index);

        // --- STATE MACHINE PROCESSING ---
        const episodesMap = new Map<string, Episode>();

        // Initial State
        // If we see iframes BEFORE any episode marker, they belong to "Movie" (or Episode 01 default)
        // If we see Episode marker, we switch context.

        let currentEpNum = '01';
        let currentPlayerNum = 1;

        // Check if there are ANY episode markers. If 0, it's definitely a movie structure.
        const hasEpisodeMarkers = tokens.some(t => t.type === 'EPISODE');

        // Helper to get or create episode
        const getEpisode = (num: string) => {
            if (!episodesMap.has(num)) {
                episodesMap.set(num, {
                    number: num,
                    title: hasEpisodeMarkers ? `Episode ${num}` : `Movie`,
                    players: [],
                    torrents: []
                });
            }
            return episodesMap.get(num)!;
        };

        for (const token of tokens) {
            if (token.type === 'EPISODE') {
                // Switch context to new episode
                currentEpNum = token.value!;
                currentPlayerNum = 1; // Reset player count for new episode (unless explicit player label says otherwise)
            } else if (token.type === 'PLAYER') {
                // Explicit player label found
                currentPlayerNum = parseInt(token.value!);
            } else if (token.type === 'IFRAME') {
                // Found a video -> Assign to current Context
                const ep = getEpisode(currentEpNum);

                // Add player to episode (avoid duplicates if any)
                if (!ep.players.find(p => p.url === token.value)) {
                    ep.players.push({
                        number: currentPlayerNum,
                        url: token.value!
                    });
                    // Increment player num for next iframe (implicit next player)
                    currentPlayerNum++;
                }
            }
        }

        // --- PROCESS MAGNETS ---
        const magnetPattern = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>)]*/gi;
        let mm;
        const allMagnets = new Set<string>();
        while ((mm = magnetPattern.exec(html)) !== null) {
            allMagnets.add(mm[0]);
        }

        // Distribute magnets to episodes
        const episodes = Array.from(episodesMap.values());

        for (const episode of episodes) {
            const epNum = parseInt(episode.number);

            // Filter magnets for this episode
            for (const magnet of allMagnets) {
                const dn = magnet.match(/dn=([^&]+)/);
                if (dn) {
                    // Normalize title: decode URL and replace non-breaking spaces/special chars
                    const title = decodeURIComponent(dn[1]).replace(/\+/g, ' ').replace(/\u00A0/g, ' ');
                    const titleUpper = title.toUpperCase();

                    // --- FLEXIBLE MATCHING LOGIC ---
                    let isMatch = false;

                    // If Movie Mode (no episode markers): Accept all magnets
                    if (!hasEpisodeMarkers) {
                        isMatch = true;
                    } else {
                        // Method 1: Exact Episode Match (EP01, EP 01, E01)
                        const exactPatterns = [
                            `EP${episode.number}`,     // EP01
                            `EP ${episode.number}`,    // EP 01
                            `EP-${episode.number}`,    // EP-01
                            `E${episode.number}`,      // E01
                        ];
                        if (exactPatterns.some(p => titleUpper.includes(p))) {
                            isMatch = true;
                        }

                        // Method 2: Range Match (EP (01-08), EP(09-11), EP01-08)
                        if (!isMatch) {
                            const rangePatterns = [
                                /EP\s*\(?(\d+)[-–](\d+)\)?/gi, // EP (01-08) or EP01-08
                                /S\d+\s*EP\s*\(?(\d+)[-–](\d+)\)?/gi, // S01 EP (15-16)
                            ];
                            for (const pattern of rangePatterns) {
                                pattern.lastIndex = 0; // Reset global regex
                                let rangeMatch;
                                while ((rangeMatch = pattern.exec(titleUpper)) !== null) {
                                    const start = parseInt(rangeMatch[1]);
                                    const end = parseInt(rangeMatch[2]);
                                    if (epNum >= start && epNum <= end) {
                                        isMatch = true;
                                        break;
                                    }
                                }
                                if (isMatch) break;
                            }
                        }
                    }

                    if (isMatch) {
                        let quality = 'Unknown';
                        if (title.includes('1080p')) quality = '1080p';
                        else if (title.includes('720p')) quality = '720p';
                        else if (title.includes('480p')) quality = '480p';

                        let size = '';
                        const sizeMatch = title.match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
                        if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`;

                        // Avoid adding duplicate magnets
                        if (!episode.torrents.find(t => t.link === magnet)) {
                            episode.torrents.push({ quality, size, link: magnet, filename: title });
                        }
                    }
                }
            }
            // Sort torrents by quality (high to low)
            const qualOrder = { '1080p': 3, '720p': 2, '480p': 1, 'Unknown': 0 };
            episode.torrents.sort((a, b) => (qualOrder[b.quality as keyof typeof qualOrder] || 0) - (qualOrder[a.quality as keyof typeof qualOrder] || 0));
        }

        // Sort episodes ascending
        episodes.sort((a, b) => parseInt(a.number) - parseInt(b.number));

        // Get first watch URL
        const watch = episodes.length > 0 && episodes[0].players.length > 0
            ? episodes[0].players[0].url
            : null;

        // PRIORITIZATION: Sort players to prefer known working ones (Luluvid, etc.)
        const PREFERRED_DOMAINS = ['luluvid', 'pstream', 'streamtape'];
        const LOW_PRIORITY_DOMAINS = ['hglink', 'guxhag'];

        const getScore = (url: string) => {
            if (PREFERRED_DOMAINS.some(d => url.includes(d))) return 2;
            if (LOW_PRIORITY_DOMAINS.some(d => url.includes(d))) return 0;
            return 1;
        };

        for (const ep of episodes) {
            ep.players.sort((a, b) => getScore(b.url) - getScore(a.url));
        }

        // Update watch URL to reflect the new first player
        const optimizedWatch = episodes.length > 0 && episodes[0].players.length > 0
            ? episodes[0].players[0].url
            : watch;

        console.log(`[API/TamilBlasters/Details] Built ${episodes.length} episodes`);

        return NextResponse.json({
            success: true,
            data: {
                metadata,
                poster,
                watch: optimizedWatch,
                episodes: episodes.length > 0 ? episodes : undefined,
                isSeriesFormat: episodes.length > 1,
            }
        });

    } catch (err: any) {
        console.error('[API/TamilBlasters/Details] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
