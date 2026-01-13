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
        // Prioritize og:image (most reliable), then main post image class, then generic attachment
        const posterPatterns = [
            /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
            /<img[^>]*class="[^"]*wp-post-image[^"]*"/i, // Check class presence only first (simpler)
            /<img[^>]*src="([^"]+)"[^>]*class="[^"]*attachment-post-thumbnail[^"]*"/i,
            /<img[^>]*class="[^"]*attachment-post-thumbnail[^"]*"[^>]*src="([^"]+)"/i,
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

        // --- PROCESS MAGNETS AND TORRENT FILES ---

        // Pattern 1: Magnet links with text context
        // We capture: 1. The Magnet URL, 2. The Link Text (which contains quality/size info)
        const magnetAnchorPattern = /<a[^>]+href=["'](magnet:\?xt=urn:btih:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        const allMagnetsData: { url: string; text: string }[] = [];
        const seenMagnets = new Set<string>();

        let mam;
        while ((mam = magnetAnchorPattern.exec(html)) !== null) {
            const url = mam[1];
            const rawText = mam[2].replace(/<[^>]+>/g, '').trim(); // Remove inner tags
            if (url && !seenMagnets.has(url)) {
                seenMagnets.add(url);
                allMagnetsData.push({ url, text: rawText });
            }
        }

        // Fallback: Find bare magnet links we might have missed (e.g. not in anchor, or complex anchor)
        const rawMagnetPattern = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>)]*/gi;
        let rmm;
        while ((rmm = rawMagnetPattern.exec(html)) !== null) {
            const url = rmm[0];
            if (!seenMagnets.has(url)) {
                seenMagnets.add(url);
                // Try to extract name from dn param as fallback text
                const dnMatch = url.match(/dn=([^&]+)/);
                const text = dnMatch ? decodeURIComponent(dnMatch[1]).replace(/\+/g, ' ') : 'Magnet Link';
                allMagnetsData.push({ url, text });
            }
        }

        // Pattern 2: .torrent file links - Multiple patterns for robustness
        const allTorrentFiles: { url: string; text: string; index: number }[] = [];

        // Pattern 2a: Standard anchor tag with .torrent href
        const torrentPattern1 = /href=["']([^"']*\.torrent[^"']*)["'][^>]*>([^<]*)/gi;
        let tf1;
        while ((tf1 = torrentPattern1.exec(html)) !== null) {
            if (tf1[1] && tf1[2]) {
                allTorrentFiles.push({ url: tf1[1], text: tf1[2].trim(), index: tf1.index });
            }
        }

        // Pattern 2b: Anchor with nested elements (get text after cleaning)
        const torrentPattern2 = /href=["']([^"']*\.torrent[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let tf2: RegExpExecArray | null;
        while ((tf2 = torrentPattern2.exec(html)) !== null) {
            if (tf2[1]) {
                const innerText = tf2![2].replace(/<[^>]+>/g, '').trim();
                if (innerText && !allTorrentFiles.find(t => t.url === tf2![1])) {
                    allTorrentFiles.push({ url: tf2![1], text: innerText, index: tf2!.index });
                }
            }
        }

        // Pattern 2c: Direct .torrent URLs anywhere in HTML
        const torrentPattern3 = /(https?:\/\/[^\s"'<>]+\.torrent)/gi;
        let tf3;
        while ((tf3 = torrentPattern3.exec(html)) !== null) {
            const url = tf3[1];
            if (!allTorrentFiles.find(t => t.url === url)) {
                const filename = decodeURIComponent(url.split('/').pop() || 'Download');
                allTorrentFiles.push({ url, text: filename, index: tf3.index });
            }
        }

        console.log(`[TamilBlasters] Found ${allMagnetsData.length} magnets, ${allTorrentFiles.length} torrent files`);

        // Distribute magnets to episodes
        const episodes = Array.from(episodesMap.values());
        console.log(`[Debug] Processing ${episodes.length} episodes. HasEpisodeMarkers: ${hasEpisodeMarkers}`);

        for (const magnetData of allMagnetsData) {
            const magnet = magnetData.url;
            const linkText = magnetData.text; // NOW WE HAVE THE FULL LINK TEXT!

            // Decode title from magnet DN for sorting/matching logic, but use linkText for Metadata!
            let title = linkText;
            if (title === 'Magnet Link' || title.length < 5) {
                // Fallback to DN if link text is useless
                const dnMatch = magnet.match(/dn=([^&]+)/);
                if (dnMatch) {
                    title = decodeURIComponent(dnMatch[1]).replace(/\+/g, ' ');
                }
            }

            const titleUpper = title.toUpperCase();

            // Extract Episode Number from Magnet Title
            let epNum = -1;
            const epMatch = titleUpper.match(/EP\s*(\d+)/) || titleUpper.match(/E(\d+)/);
            if (epMatch) {
                epNum = parseInt(epMatch[1]);
            }

            // REWRITE LOOP TO ITERATE EPISODES vs MAGNETS CORRECTLY
            // Actually, we should iterate magnets and try to place them in episodes

            for (const episode of episodes) {
                const epNumber = parseInt(episode.number);
                let isMatch = false;

                if (!hasEpisodeMarkers || episodes.length === 1) {
                    isMatch = true;
                } else {
                    // Check if this magnet matches this episode
                    const exactPatterns = [`EP${episode.number}`, `EP ${episode.number}`, `E${episode.number}`];
                    if (exactPatterns.some(p => titleUpper.includes(p))) isMatch = true;

                    if (!isMatch && epNum === epNumber) isMatch = true;

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
                                if (epNumber >= start && epNumber <= end) {
                                    isMatch = true;
                                    break;
                                }
                            }
                            if (isMatch) break;
                        }
                    }
                }

                if (isMatch) {
                    // Case-insensitive quality extraction using LINK TEXT (title) which has full info
                    const textToCheck = (title + ' ' + magnet).toUpperCase(); // Combine text and url for best search

                    let quality = 'Unknown';
                    if (/\b4K\b|2160P/.test(textToCheck)) quality = '4K';
                    else if (/\b1080P\b/.test(textToCheck)) quality = '1080p';
                    else if (/\b720P\b/.test(textToCheck)) quality = '720p';
                    else if (/\b480P\b/.test(textToCheck)) quality = '480p';
                    else if (/PREDVD|PRE[\s-]?DVD/i.test(textToCheck)) quality = 'PreDVD';
                    else if (/HDCAM|HD[\s-]?CAM/i.test(textToCheck)) quality = 'HDCam';
                    else if (/\bHQ\b/i.test(textToCheck)) quality = 'HQ';
                    else if (/\bHD\b/.test(textToCheck)) quality = 'HD'; // Generic HD fallback

                    let size = '';
                    const sizeMatch = textToCheck.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
                    if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`;

                    // Clean up filename
                    let cleanFilename = title
                        .replace(/^(www\.|https?:\/\/)?[a-zA-Z0-9.-]+\.(business|world|watch|org|com|net)\s*[-–—]\s*/gi, '')
                        .replace(/\.mkv\.torrent$/i, '')
                        .replace(/\.mkv$/i, '')
                        .replace(/\.mp4$/i, '')
                        .replace(/\.torrent$/i, '')
                        .replace(/–/g, '-')
                        .trim();

                    // Final cleanup of leading dashes
                    cleanFilename = cleanFilename.replace(/^[-–—\s]+/, '').trim();

                    // Avoid adding duplicate magnets
                    if (!episode.torrents.find(t => t.link === magnet)) {
                        episode.torrents.push({ quality, size, link: magnet, filename: cleanFilename });
                        console.log(`[MagnetParse] Added: ${quality} | ${size} | ${cleanFilename.substring(0, 40)}...`);
                    }
                }
            }
        }

        // Sort torrents by quality (high to low)
        for (const ep of episodes) {
            const qualOrder = { '4K': 5, '1080p': 4, '720p': 3, 'PreDVD': 2, 'HQ': 2, 'HD': 2, '480p': 1, 'Unknown': 0 };
            ep.torrents.sort((a, b) => (qualOrder[b.quality as keyof typeof qualOrder] || 0) - (qualOrder[a.quality as keyof typeof qualOrder] || 0));
        }

        // --- PROCESS .TORRENT FILES (add to first/all episodes for movies) ---
        for (const tf of allTorrentFiles) {
            const rawText = tf.text.trim();
            const url = tf.url;

            // Skip empty links
            if (!url) continue;

            // Decode the URL to get filename
            const decodedUrl = decodeURIComponent(url);
            const urlFilename = decodedUrl.split('/').pop() || '';

            // PRIORITY: Use URL filename if it has more info (typical: site.torrent or full-name.mkv.torrent)
            // The link TEXT is often truncated, but URL filename has full details
            let contentToSearch = (rawText + ' ' + urlFilename).toUpperCase();

            // QUALITY EXTRACTION - Order matters! Check specific first
            let quality = 'Unknown';
            if (/\b4K\b|2160P/.test(contentToSearch)) quality = '4K';
            else if (/\b1080P\b/.test(contentToSearch)) quality = '1080p';
            else if (/\b720P\b/.test(contentToSearch)) quality = '720p';
            else if (/\b480P\b/.test(contentToSearch)) quality = '480p';
            else if (/PREDVD|PREDVDRIP|PRE[\s-]?DVD/i.test(contentToSearch)) quality = 'PreDVD';
            else if (/HDCAM|HD[\s-]?CAM/i.test(contentToSearch)) quality = 'HDCam';
            else if (/HQ|HIGH[\s-]?QUALITY/i.test(contentToSearch)) quality = 'HQ';
            // Only fallback to generic HD if "HD" appears but not as part of other terms
            else if (/\bHD\b/.test(contentToSearch) && !contentToSearch.includes('PREDVD')) quality = 'HD';

            // SIZE EXTRACTION - Match patterns: 2.2GB, 1.5 GB, 700MB, 250 MB
            let size = '';
            const sizeMatch = contentToSearch.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
            if (sizeMatch) {
                size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`;
            }

            // DISPLAY NAME - Clean up the filename for display
            // Priority: Use URL filename (usually more complete), clean it up
            let displayName = urlFilename.length > rawText.length ? urlFilename : rawText;

            // Remove .torrent, .mkv, .mp4 extensions
            displayName = displayName
                .replace(/\.torrent$/i, '')
                .replace(/\.mkv$/i, '')
                .replace(/\.mp4$/i, '')
                .replace(/\.avi$/i, '');

            // Fix HTML entities
            displayName = displayName
                .replace(/&#8211;/g, '-')
                .replace(/&ndash;/g, '-')
                .replace(/&nbsp;/g, ' ')
                .replace(/–/g, '-'); // Unicode en-dash

            // Remove site prefix (www.1TamilBlasters.Business – )
            displayName = displayName
                .replace(/^(www\.|https?:\/\/)?[a-zA-Z0-9.-]+\.(business|world|watch|org|com|net)\s*[-–—]\s*/gi, '')
                .trim();

            // Clean leading dashes
            displayName = displayName.replace(/^[-–—\s]+/, '').trim();

            // Make URL absolute if relative
            const absoluteUrl = url.startsWith('http')
                ? url
                : `https://www.1tamilblasters.business${url.startsWith('/') ? '' : '/'}${url}`;

            // Add to first episode (for movies) or appropriate episode
            const targetEpisode = episodes[0];
            if (targetEpisode && !targetEpisode.torrents.find(t => t.link === absoluteUrl)) {
                targetEpisode.torrents.push({
                    quality,
                    size,
                    link: absoluteUrl,
                    filename: displayName
                });
                console.log(`[TorrentParse] Added: ${quality} | ${size} | ${displayName.substring(0, 50)}...`);
            }
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
