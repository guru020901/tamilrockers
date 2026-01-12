import { NextResponse } from 'next/server';
import { fetchHtmlWithBypass } from '@/lib/proxy';
import { getDomain } from '@/lib/config';

/**
 * 🚀 ADVANCED 1TamilBlasters Details Scraper
 * Extracts:
 * - Series Metadata (Title, Original Title, Director, Plot Summary)
 * - All Episodes with their video previews
 * - Multiple quality torrents per episode (1080p, 720p, 480p)
 */

interface TorrentLink {
    quality: string;
    size: string;
    link: string;
    filename: string;
}

interface Episode {
    number: string;
    title: string;
    videoPreview?: string;
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

        // Series Name
        const seriesNameMatch = html.match(/Series\s*Name:\s*<\/strong>\s*([^<]+)/i) ||
            html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        if (seriesNameMatch) metadata.seriesName = seriesNameMatch[1].trim();

        // Original Title
        const originalTitleMatch = html.match(/Original\s*Title:\s*<\/strong>\s*([^<]+)/i);
        if (originalTitleMatch) metadata.originalTitle = originalTitleMatch[1].trim();

        // Directed by
        const directorMatch = html.match(/Directed\s*by:\s*<\/strong>\s*([^<]+)/i);
        if (directorMatch) metadata.director = directorMatch[1].trim();

        // Plot Summary
        const plotMatch = html.match(/Plot\s*Summary:\s*<\/p>\s*<p[^>]*>([^<]+)/i) ||
            html.match(/<p[^>]*class="[^"]*plot[^"]*"[^>]*>([^<]+)/i);
        if (plotMatch) metadata.plotSummary = plotMatch[1].trim();

        // Extract year from title
        const yearMatch = html.match(/\((\d{4})\)/);
        if (yearMatch) metadata.year = yearMatch[1];

        // --- EXTRACT POSTER ---
        let poster = null;
        const posterPatterns = [
            /<img[^>]*class="[^"]*attachment-post-thumbnail[^"]*"[^>]*src="([^"]+)"/i,
            /<img[^>]*src="([^"]+)"[^>]*class="[^"]*wp-post-image[^"]*"/i,
            /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
            /<img[^>]*src="(https?:\/\/[^"]+(?:poster|cover|thumb)[^"]+)"/i,
        ];

        for (const pattern of posterPatterns) {
            const posterMatch = pattern.exec(html);
            if (posterMatch) {
                poster = posterMatch[1];
                break;
            }
        }

        // --- EXTRACT EPISODES WITH TORRENTS ---
        const episodes: Episode[] = [];

        // Multi-format episode detection patterns:
        // - "Episode – 11", "Episode - 07", "Episode 01"
        // - "EP-01", "EP 01", "EP01"  
        // - "S01EP01", "S02EP(01-04)" (range format)
        const episodePatterns = [
            /Episode\s*[-–]?\s*(\d+)/gi,     // Episode – 11, Episode - 07, Episode 01
            /\bEP[-\s]*(\d+)/gi,              // EP-01, EP 01, EP01
        ];

        // Try to find episode markers in HTML
        let episodeMarkers: { number: string; index: number }[] = [];

        for (const pattern of episodePatterns) {
            let episodeMatch;
            while ((episodeMatch = pattern.exec(html)) !== null) {
                episodeMarkers.push({
                    number: episodeMatch[1],
                    index: episodeMatch.index
                });
            }
            if (episodeMarkers.length > 0) break; // Use first matching pattern
        }

        // Deduplicate and sort by position
        const seenEpisodes = new Set<string>();
        episodeMarkers = episodeMarkers
            .filter(m => {
                if (seenEpisodes.has(m.number)) return false;
                seenEpisodes.add(m.number);
                return true;
            })
            .sort((a, b) => a.index - b.index);

        // Extract content between episode markers
        for (let i = 0; i < episodeMarkers.length; i++) {
            const startIdx = episodeMarkers[i].index;
            const endIdx = i < episodeMarkers.length - 1 ? episodeMarkers[i + 1].index : html.length;
            const sectionHtml = html.substring(startIdx, endIdx);

            const episode: Episode = {
                number: episodeMarkers[i].number.padStart(2, '0'),
                title: `Episode ${episodeMarkers[i].number.padStart(2, '0')}`,
                torrents: []
            };

            // Extract video preview (iframe) for this episode
            const iframeMatch = sectionHtml.match(/<iframe[^>]*src="([^"]+)"/i);
            if (iframeMatch) {
                const src = iframeMatch[1];
                if (!src.includes('googlead') && !src.includes('facebook')) {
                    episode.videoPreview = src;
                }
            }

            // Extract torrent links with quality info
            // Pattern: www.1TamilBlasters.Business - Title - Quality - Size.mkv.torrent
            const torrentPattern = /<a[^>]*href="([^"]*\.torrent)"[^>]*>([^<]+)<\/a>/gi;
            let torrentMatch;

            while ((torrentMatch = torrentPattern.exec(sectionHtml)) !== null) {
                const link = torrentMatch[1];
                const text = torrentMatch[2];

                // Parse quality from filename
                let quality = 'Unknown';
                if (text.includes('1080p')) quality = '1080p';
                else if (text.includes('720p')) quality = '720p';
                else if (text.includes('480p')) quality = '480p';
                else if (text.includes('4K') || text.includes('2160p')) quality = '4K';
                else if (text.includes('HDRip')) quality = 'HDRip';
                else if (text.includes('WEB-DL')) quality = 'WEB-DL';

                // Parse size from filename
                let size = '';
                const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
                if (sizeMatch) {
                    size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`;
                }

                episode.torrents.push({
                    quality,
                    size,
                    link: link.startsWith('http') ? link : `${domain}${link}`,
                    filename: text.trim()
                });
            }

            // Also check for magnet links
            const magnetPattern = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>)]*/gi;
            let magnetMatch;
            while ((magnetMatch = magnetPattern.exec(sectionHtml)) !== null) {
                const magnet = magnetMatch[0];
                const dnMatch = magnet.match(/dn=([^&]+)/);
                const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';

                let quality = 'Unknown';
                if (title.includes('1080p')) quality = '1080p';
                else if (title.includes('720p')) quality = '720p';
                else if (title.includes('480p')) quality = '480p';

                let size = '';
                const sizeMatch = title.match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
                if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`;

                episode.torrents.push({
                    quality,
                    size,
                    link: magnet,
                    filename: title
                });
            }

            if (episode.torrents.length > 0 || episode.videoPreview) {
                episodes.push(episode);
            }
        }

        // --- FALLBACK: If no episodes found, extract all magnets/torrents as a single "movie" ---
        let allMagnets: TorrentLink[] = [];
        if (episodes.length === 0) {
            const magnetPattern = /magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s<>)]*/gi;
            let match;
            while ((match = magnetPattern.exec(html)) !== null) {
                const magnet = match[0];
                const dnMatch = magnet.match(/dn=([^&]+)/);
                const title = dnMatch ? decodeURIComponent(dnMatch[1].replace(/\+/g, ' ')) : 'Unknown';

                let quality = 'Unknown';
                if (title.includes('1080p')) quality = '1080p';
                else if (title.includes('720p')) quality = '720p';
                else if (title.includes('480p')) quality = '480p';

                let size = '';
                const sizeMatch = title.match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
                if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`;

                allMagnets.push({
                    quality,
                    size,
                    link: magnet,
                    filename: title
                });
            }

            // Deduplicate
            const seen = new Set();
            allMagnets = allMagnets.filter(m => {
                if (seen.has(m.link)) return false;
                seen.add(m.link);
                return true;
            });
        }

        // Extract first video for direct watch
        let watch = null;
        const iframePatterns = [
            /<iframe[^>]*src="([^"]+(?:cybervynx|dood|streamtape|embed|player)[^"]+)"/i,
            /<iframe[^>]*src="(https?:\/\/[^"]+)"/i,
        ];
        for (const pattern of iframePatterns) {
            const iframeMatch = pattern.exec(html);
            if (iframeMatch) {
                const src = iframeMatch[1];
                if (!src.includes('googlead') && !src.includes('facebook') && !src.includes('twitter')) {
                    watch = src;
                    break;
                }
            }
        }

        console.log(`[API/TamilBlasters/Details] Found ${episodes.length} episodes, ${allMagnets.length} standalone magnets`);

        return NextResponse.json({
            success: true,
            data: {
                metadata,
                poster,
                watch,
                episodes: episodes.length > 0 ? episodes : undefined,
                magnets: episodes.length === 0 ? allMagnets : undefined,
                isSeriesFormat: episodes.length > 0,
            }
        });

    } catch (err: any) {
        console.error('[API/TamilBlasters/Details] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
