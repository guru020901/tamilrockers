import { NextResponse } from 'next/server';

/**
 * 🚀 ENHANCED TamilMV Details Scraper v2
 * 
 * Now includes:
 * - Quality/Size extraction from magnet display names
 * - Episode detection for series
 * - Player URL extraction (iframe sources)
 * - Structured output matching TamilBlasters format
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

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
    }

    console.log(`[API/TamilMV/Details] Fetching: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': new URL(targetUrl).origin,
            },
            signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();

        // --- ENHANCED MAGNET EXTRACTION WITH QUALITY/SIZE ---
        const torrents: TorrentLink[] = [];
        const magnetPattern = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>)]*/gi;

        let match;
        const seenMagnets = new Set<string>();

        while ((match = magnetPattern.exec(html)) !== null) {
            const magnet = match[0];

            // Skip duplicates
            if (seenMagnets.has(magnet)) continue;
            seenMagnets.add(magnet);

            const dnMatch = magnet.match(/dn=([^&]+)/);
            const filename = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';
            const filenameUpper = filename.toUpperCase();

            // Extract quality from filename
            let quality = 'Unknown';
            if (filenameUpper.includes('4K') || filenameUpper.includes('2160P')) quality = '4K';
            else if (filenameUpper.includes('1080P') || filenameUpper.includes('FHD')) quality = '1080p';
            else if (filenameUpper.includes('720P') || filenameUpper.includes('HD')) quality = '720p';
            else if (filenameUpper.includes('480P') || filenameUpper.includes('SD')) quality = '480p';
            else if (filenameUpper.includes('HDCAM') || filenameUpper.includes('CAM')) quality = 'CAM';
            else if (filenameUpper.includes('PREDVD') || filenameUpper.includes('HQ')) quality = 'HQ';

            // Extract size from filename (e.g., "1.2GB", "800MB")
            let size = '';
            const sizeMatch = filename.match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
            if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`;

            torrents.push({ link: magnet, filename, quality, size });
        }

        // Sort torrents by quality (highest first)
        const qualityOrder: Record<string, number> = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2, 'HQ': 1, 'CAM': 0, 'Unknown': -1 };
        torrents.sort((a, b) => (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0));

        // --- EXTRACT PLAYER IFRAMES ---
        const players: Player[] = [];
        const iframePattern = /<iframe[^>]*src=["']([^"']+)["']/gi;
        let playerNum = 1;

        while ((match = iframePattern.exec(html)) !== null) {
            const src = match[1];
            // Filter for video players only
            if (src.includes('player') || src.includes('embed') || src.includes('stream') ||
                src.includes('luluvid') || src.includes('hglink') || src.includes('pstream') ||
                src.includes('streamtape') || src.includes('dood')) {

                // Avoid duplicates
                if (!players.find(p => p.url === src)) {
                    players.push({ number: playerNum++, url: src });
                }
            }
        }

        // Sort players by preferred order (Luluvid first)
        const getPlayerScore = (url: string) => {
            if (url.includes('luluvid')) return 5;
            if (url.includes('pstream')) return 4;
            if (url.includes('streamtape')) return 3;
            if (url.includes('hglink') || url.includes('guxhag')) return 2;
            return 1;
        };
        players.sort((a, b) => getPlayerScore(b.url) - getPlayerScore(a.url));

        // --- DETECT EPISODES (for series) ---
        const episodeMarkers: { num: string; index: number }[] = [];
        const epPatterns = [
            /Episode\s*(?:[-–]|&#8211;|&ndash;)\s*(\d+)/gi,
            /\bEP[-\s]*(\d+)/gi,
            /Episode\s+(\d+)/gi,
            /S\d+EP(\d+)/gi,
        ];

        for (const pattern of epPatterns) {
            let m;
            while ((m = pattern.exec(html)) !== null) {
                episodeMarkers.push({ num: m[1].padStart(2, '0'), index: m.index });
            }
        }

        // Determine if this is a series (multiple distinct episode markers)
        const uniqueEpisodes = [...new Set(episodeMarkers.map(e => e.num))];
        const isSeriesFormat = uniqueEpisodes.length > 1;

        // Build episodes array
        let episodes: Episode[] = [];
        if (isSeriesFormat) {
            // Series: Create episode entries (simplified - all share same players for now)
            episodes = uniqueEpisodes.sort().map(num => ({
                number: num,
                title: `Episode ${num}`,
                players: players, // All episodes get same players (TamilMV structure)
                torrents: torrents.filter(t => {
                    const fn = t.filename.toUpperCase();
                    return fn.includes(`EP${num}`) || fn.includes(`EP ${num}`) || fn.includes(`E${num}`);
                })
            }));

            // If no episode-specific torrents matched, add all torrents to first episode
            if (episodes.every(ep => ep.torrents.length === 0)) {
                episodes.forEach(ep => { ep.torrents = torrents; });
            }
        } else {
            // Movie: Single episode with all torrents
            episodes = [{
                number: '01',
                title: 'Movie',
                players: players,
                torrents: torrents
            }];
        }

        // --- EXTRACT POSTER ---
        let poster = null;
        const posterPatterns = [
            /<img[^>]*class="[^"]*ipsImage[^"]*"[^>]*src="([^"]+)"/i,
            /<img[^>]*src="([^"]+)"[^>]*class="[^"]*ipsImage[^"]*"/i,
            /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
            /<img[^>]*src="(https?:\/\/[^"]+(?:jpg|jpeg|png|webp)[^"]*)"/i,
        ];

        for (const pattern of posterPatterns) {
            const posterMatch = pattern.exec(html);
            if (posterMatch && !posterMatch[1].includes('avatar') && !posterMatch[1].includes('emoji')) {
                poster = posterMatch[1];
                break;
            }
        }

        // --- EXTRACT IMDB ID ---
        let imdbId = null;
        const imdbPatterns = [
            /imdb\.com\/title\/(tt\d+)/i,
            /(tt\d{7,})/i,
        ];

        for (const pattern of imdbPatterns) {
            const imdbMatch = pattern.exec(html);
            if (imdbMatch) {
                imdbId = imdbMatch[1];
                break;
            }
        }

        // Get first watch URL
        const watch = players.length > 0 ? players[0].url : null;

        console.log(`[API/TamilMV/Details] Found ${torrents.length} magnets, ${players.length} players, ${episodes.length} episodes, isSeriesFormat: ${isSeriesFormat}`);

        return NextResponse.json({
            success: true,
            data: {
                // Legacy format (backwards compatible)
                magnets: torrents,
                poster,
                imdbId,
                watch,
                // NEW: Structured format (matches TamilBlasters)
                episodes,
                isSeriesFormat,
                metadata: {
                    seriesName: null // Could be extracted from title if needed
                }
            }
        });

    } catch (err: any) {
        console.error('[API/TamilMV/Details] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
