import { NextResponse } from 'next/server';
import { fetchHtmlWithBypass } from '@/lib/proxy';
import { getDomain } from '@/lib/config';

/**
 * 🚀 ADVANCED 1TamilBlasters Details Scraper v4
 * 
 * Architecture Analysis (1TamilBlasters):
 * - Episodes: Marked as "EP11", "EP10" (NOT "Episode – 11")
 * - Players: Multiple players per movie/episode ("Player: 01", "Player: 02")
 * - Video Embeds: Multiple iframes in descending order
 * - Torrents: Magnet links (not .torrent files)
 * 
 * Strategy: Extract all iframes, detect Player labels, group by episode/player
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
    players: Player[]; // Multiple players per episode
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

        // --- STEP 1: DETECT PLAYER LABELS AND EXTRACT IFRAMES ---
        // Look for "Player: 01", "Player 02", "Player: 1" patterns and associate with following iframe
        const playerSections: { playerNum: number; iframeSrc: string }[] = [];

        // Pattern to find Player labels followed by iframes
        const playerIframePattern = /Player[:.\s]*(\d+)[^<]*<[\s\S]{0,500}?<iframe[^>]*src="([^"]+)"/gi;
        let playerMatch;
        while ((playerMatch = playerIframePattern.exec(html)) !== null) {
            const playerNum = parseInt(playerMatch[1]);
            const src = playerMatch[2];
            if (!src.includes('googlead') && !src.includes('facebook')) {
                playerSections.push({ playerNum, iframeSrc: src });
            }
        }

        // Fallback: If no Player labels found, just extract all iframes and number them sequentially
        if (playerSections.length === 0) {
            const iframePattern = /<iframe[^>]*src="([^"]+)"[^>]*>/gi;
            let iframeMatch;
            let playerNum = 1;
            while ((iframeMatch = iframePattern.exec(html)) !== null) {
                const src = iframeMatch[1];
                if (!src.includes('googlead') && !src.includes('facebook') && !src.includes('twitter')) {
                    playerSections.push({ playerNum, iframeSrc: src });
                    playerNum++;
                }
            }
        }

        console.log(`[API/TamilBlasters/Details] Found ${playerSections.length} players`);

        // --- STEP 2: EXTRACT EPISODE NUMBERS ---
        const epPattern = /\bEP[-\s]?(\d+)/gi;
        const episodeNumbers: string[] = [];
        const seenEp = new Set<string>();
        let epMatch;
        while ((epMatch = epPattern.exec(html)) !== null) {
            const num = epMatch[1].padStart(2, '0');
            if (!seenEp.has(num)) {
                seenEp.add(num);
                episodeNumbers.push(num);
            }
        }
        episodeNumbers.sort((a, b) => parseInt(a) - parseInt(b)); // Sort ascending EP01 -> EP11
        console.log(`[API/TamilBlasters/Details] Found episode numbers: ${episodeNumbers.join(', ')}`);

        // --- STEP 3: EXTRACT ALL MAGNETS ---
        const magnetPattern = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>)]*/gi;
        const allMagnets: string[] = [];
        let magnetMatch;
        while ((magnetMatch = magnetPattern.exec(html)) !== null) {
            allMagnets.push(magnetMatch[0]);
        }
        const uniqueMagnets = [...new Set(allMagnets)];
        console.log(`[API/TamilBlasters/Details] Found ${uniqueMagnets.length} unique magnets`);

        // --- STEP 4: BUILD EPISODE/MOVIE OBJECTS ---
        const episodes: Episode[] = [];

        // Determine if this is a series (has episode numbers) or a movie
        const isSeries = episodeNumbers.length > 1;

        if (isSeries) {
            // For series: Group players by episode number matching
            for (const epNum of episodeNumbers) {
                const episode: Episode = {
                    number: epNum,
                    title: `Episode ${epNum}`,
                    players: [],
                    torrents: []
                };

                // Find matching magnets for this episode
                for (const magnet of uniqueMagnets) {
                    const dn = magnet.match(/dn=([^&]+)/);
                    if (dn) {
                        const title = decodeURIComponent(dn[1]);
                        if (title.includes(`EP${epNum}`) || title.includes(`EP${parseInt(epNum)}`)) {
                            let quality = 'Unknown';
                            if (title.includes('1080p')) quality = '1080p';
                            else if (title.includes('720p')) quality = '720p';
                            else if (title.includes('480p')) quality = '480p';

                            let size = '';
                            const sizeMatch = title.match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
                            if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`;

                            episode.torrents.push({ quality, size, link: magnet, filename: title.replace(/\+/g, ' ') });
                        }
                    }
                }

                episodes.push(episode);
            }

            // Distribute players to episodes (assuming players are in episode order)
            const playersPerEpisode = Math.ceil(playerSections.length / episodeNumbers.length);
            for (let i = 0; i < episodes.length; i++) {
                const startIdx = i * playersPerEpisode;
                const endIdx = Math.min(startIdx + playersPerEpisode, playerSections.length);
                for (let j = startIdx; j < endIdx; j++) {
                    episodes[i].players.push({
                        number: j - startIdx + 1,
                        url: playerSections[j].iframeSrc
                    });
                }
            }
        } else {
            // For movies: Single "episode" with all players
            const movieEpisode: Episode = {
                number: '01',
                title: 'Movie',
                players: playerSections.map((p, idx) => ({ number: p.playerNum || idx + 1, url: p.iframeSrc })),
                torrents: []
            };

            // Add all magnets to movie
            for (const magnet of uniqueMagnets) {
                const dnMatch = magnet.match(/dn=([^&]+)/);
                const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';

                let quality = 'Unknown';
                if (title.includes('1080p')) quality = '1080p';
                else if (title.includes('720p')) quality = '720p';
                else if (title.includes('480p')) quality = '480p';

                let size = '';
                const sizeMatch = title.match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
                if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`;

                movieEpisode.torrents.push({ quality, size, link: magnet, filename: title });
            }

            if (movieEpisode.players.length > 0 || movieEpisode.torrents.length > 0) {
                episodes.push(movieEpisode);
            }
        }

        // Get first watch URL (first player of first episode)
        const watch = episodes.length > 0 && episodes[0].players.length > 0
            ? episodes[0].players[0].url
            : null;

        console.log(`[API/TamilBlasters/Details] Built ${episodes.length} episodes`);

        return NextResponse.json({
            success: true,
            data: {
                metadata,
                poster,
                watch,
                episodes: episodes.length > 0 ? episodes : undefined,
                isSeriesFormat: episodes.length > 1,
            }
        });

    } catch (err: any) {
        console.error('[API/TamilBlasters/Details] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
