import { NextResponse } from 'next/server';
import { fetchHtmlWithBypass } from '@/lib/proxy';

/**
 * 🕵️‍♂️ STREAM EXTRACTOR API
 * Extracts direct video links (.m3u8, .mp4) from hosting pages
 * Bypasses ads by getting the raw stream URL
 */

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    // console.log(`[API/Extract] Extracting stream from: ${url}`);

    try {
        const html = await fetchHtmlWithBypass(url, new URL(url).origin);

        let streamUrl = null;
        let type = 'mp4';

        // 0. De-obfuscate Packed Scripts (common in video players)
        // Looks for eval(function(p,a,c,k,e,d)...)
        const packedPattern = /eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\)\)\)/;
        const packedMatch = packedPattern.exec(html);

        if (packedMatch) {
            try {
                // Determine the unpack logic (simplified)
                // In a real environment we might need a safer unpacker, 
                // but checking the decoded content often reveals the stream.
                // For now, let's look for stream patterns globally first.
            } catch (e) {
                // ignore
            }
        }

        // 1. Guxhag / Hglink / HQtier (Generic HLS Finder)
        const hlsPatterns = [
            /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /source\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
            /=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
        ];

        // 1.1 Provider Specific Logic
        // Filemoon / Vidmoly / Streamwish often hide links in specific variables
        const providerPatterns = [
            /window\.s\s*=\s*['"]([^'"]+)['"]/, // Common formatted string
            /jwplayer\("vplayer"\)\.setup\({[\s\S]*?file:\s*["']([^"']+)["']/, // JWPlayer setup (standard)
            /sources:\s*\[\s*{[\s\S]*?file:\s*["']([^"']+)["']/, // JWPlayer setup (sources array)
            /new\s+Playerjs\({[\s\S]*?file:\s*["']([^"']+)["']/, // PlayerJS
        ];

        // Merge patterns
        const allHlsPatterns = [...hlsPatterns, ...providerPatterns];

        // 1.2 Specialized Providers (DoodStream / StreamTape / Voe)
        // These often have specific "token" based URLs that need reconstruction or specific regex
        const specialProviders = [
            // StreamTape (get_video?id=...&token=...)
            /get_video\?id=([^&]+)&token=([^"']+)/,
            // DoodStream (pass_md5/...)
            /\/pass_md5\/([^"']+)/,
        ];

        // 2. Generic MP4 patterns (Moved up for scope access)
        const mp4Patterns = [
            /file\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
            /source\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
            /src\s*:\s*["']([^"']+\.mp4[^"']*)["']/i,
            /["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i, // Aggressive
        ];

        // Helper to unpack Dean Edwards packed scripts
        const unpack = (code: string): string => {
            try {
                // Detect standard packer pattern
                const indentifier = /eval\(function\(p,a,c,k,e,d\)/;
                if (!indentifier.test(code)) return code;

                // Extract the parameters
                const params = /return p}\('(.+?)',(\d+),(\d+),'(.+?)'\.split/.exec(code);
                if (!params) return code;

                let [_, p, aStr, cStr, kStr] = params;
                let k = kStr.split('|');

                // Heuristic Unpack: Check the dictionary for URLs
                const foundUrl = k.find(word => word.startsWith('http') && (word.includes('.m3u8') || word.includes('.mp4')));
                if (foundUrl) return `var src="${foundUrl}";`;

                return code;
            } catch (e) {
                return code;
            }
        };

        // 1.1 Unpack and Search (Packed Scripts)
        const packedScripts = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/g);
        if (packedScripts) {
            console.log(`[API/Extract] Found ${packedScripts.length} packed scripts. Unpacking...`);
            for (const script of packedScripts) {
                const unpacked = unpack(script);
                // Search unpacked content
                const hlsMatch = hlsPatterns.find(p => p.test(unpacked))?.exec(unpacked);
                if (hlsMatch) {
                    streamUrl = hlsMatch[1];
                    type = 'hls';
                    break;
                }
                const mp4Match = mp4Patterns.find(p => p.test(unpacked))?.exec(unpacked);
                if (mp4Match) {
                    streamUrl = mp4Match[1];
                    type = 'mp4';
                    break;
                }
            }
        }

        if (!streamUrl) {
            // 1.2 Normal Search
            for (const pattern of allHlsPatterns) {
                const match = pattern.exec(html);
                if (match) {
                    streamUrl = match[1];
                    if (streamUrl.includes('.m3u8')) type = 'hls';
                    else type = 'mp4';
                    break;
                }
            }
        }

        // 1.5 Base64 encoded HLS
        if (!streamUrl) {
            const base64Pattern = /["']([a-zA-Z0-9+/=]{20,})["']/;
            let b64Match;
            const globalB64 = new RegExp(base64Pattern, 'g');
            while ((b64Match = globalB64.exec(html)) !== null) {
                try {
                    const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
                    if (decoded.includes('.m3u8') && decoded.startsWith('http')) {
                        streamUrl = decoded;
                        type = 'hls';
                        break;
                    }
                } catch (e) { continue; }
            }
        }

        // 2. Generic MP4 Finder (if HLS not found)
        if (!streamUrl) {
            for (const pattern of mp4Patterns) {
                const match = pattern.exec(html);
                if (match) {
                    streamUrl = match[1];
                    type = 'mp4';
                    break;
                }
            }
        }

        // 3. ⛏️ DEEP MINING: Recursive Iframe Extraction
        if (!streamUrl) {
            const iframePatterns = [
                /<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i,
                /<embed[^>]+src=["'](https?:\/\/[^"']+)["']/i,
            ];

            for (const pattern of iframePatterns) {
                const match = pattern.exec(html);
                if (match) {
                    const iframeUrl = match[1];
                    console.log(`[API/Extract] Deep Mining: Following iframe to ${iframeUrl}`);

                    try {
                        const iframeHtml = await fetchHtmlWithBypass(iframeUrl, new URL(iframeUrl).origin);

                        // Repeat search on iframe content
                        // Unpack first
                        const deepPackedScripts = iframeHtml.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/g);
                        if (deepPackedScripts) {
                            for (const script of deepPackedScripts) {
                                const unpacked = unpack(script);
                                const deepMp4Match = mp4Patterns.find(p => p.test(unpacked))?.exec(unpacked);
                                if (deepMp4Match) {
                                    streamUrl = deepMp4Match[1];
                                    type = 'mp4';
                                    break;
                                }
                            }
                        }

                        if (!streamUrl) {
                            const deepHlsMatch = hlsPatterns.find(p => p.test(iframeHtml))?.exec(iframeHtml);
                            if (deepHlsMatch) {
                                streamUrl = deepHlsMatch[1];
                                type = 'hls';
                            }
                        }

                        if (!streamUrl) {
                            const deepMp4Match = mp4Patterns.find(p => p.test(iframeHtml))?.exec(iframeHtml);
                            if (deepMp4Match) {
                                streamUrl = deepMp4Match[1];
                                type = 'mp4';
                            }
                        }

                    } catch (deepErr) {
                        console.warn(`[API/Extract] Deep Mining failed for ${iframeUrl}`);
                    }
                }
                if (streamUrl) break;
            }
        }

        // URL Cleanup
        if (streamUrl) {
            streamUrl = streamUrl.replace(/\\\//g, '/'); // Fix escaped slashes
        }

        if (streamUrl) {
            console.log(`[API/Extract] Success: ${streamUrl.substring(0, 50)}...`);
            return NextResponse.json({
                success: true,
                streamUrl,
                type,
                headers: {
                    Referer: url, // Or iframe origin if deep mined
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                }
            });
        }

        console.log(`[API/Extract] Failed to find stream in: ${url}`);
        return NextResponse.json({ success: false, error: 'No stream found' }, { status: 404 });

    } catch (err: any) {
        console.error(`[API/Extract] Error: ${err.message}`);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
