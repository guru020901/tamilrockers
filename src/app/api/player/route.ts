import { NextResponse } from 'next/server';
import { fetchHtmlWithBypass } from '@/lib/proxy';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return new NextResponse('Missing URL', { status: 400 });
    }

    try {
        const origin = new URL(targetUrl).origin;
        // Fetch original player HTML
        let html = await fetchHtmlWithBypass(targetUrl, origin);

        // 🛡️ INJECT AD-BLOCKER (MITM Injection)
        // 1. Fix relative paths with <base>
        if (!html.includes('<base')) {
            html = html.replace('<head>', `<head><base href="${origin}/">`);
        }

        // 2. Inject Killer Script (Blocks Popups, Overlays, and Anti-Adblock)
        const killerScript = `
            <script>
                (function() {
                    console.log('🛡️ proxy-player: AdBlock Active');
                    
                    // 1. Block window.open (Popups)
                    window.open = function() { console.log('🛑 Popup blocked'); return null; };
                    
                    // 2. Block Popunders (Simulated clicks)
                    window.onclick = function(e) { e.stopPropagation(); };
                    
                    // 3. Anti-Anti-Adblock (Mock Sandbox check)
                    // Some players check frameElement.sandbox - we create a fake one if needed, 
                    // but since we render without sandbox attribute, this check usually passes.
                    
                    // 4. Remove Overlay Ads
                    setInterval(() => {
                        const badSelectors = [
                            '.adsbox', '.ad-box', '#ad-container', 
                            'div[style*="z-index"][style*="2147483647"]', 
                            'div[style*="cursor: pointer"][style*="display: block"]'
                        ];
                        badSelectors.forEach(sel => {
                            document.querySelectorAll(sel).forEach(el => el.remove());
                        });
                        
                        // Kill invisible overlays
                        document.querySelectorAll('div').forEach(div => {
                            const style = window.getComputedStyle(div);
                            if (style.position === 'fixed' && style.zIndex > 1000 && style.opacity < 0.1) {
                                div.remove();
                            }
                        });
                    }, 500);
                })();
            </script>
        `;

        // Inject script at top of head
        html = html.replace('<head>', `<head>${killerScript}`);

        // 3. Relax Content-Security-Policy (if present) to allow our script
        // (We strip original CSP meta tags)
        html = html.replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi, '');

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html',
                'X-Frame-Options': 'SAMEORIGIN' // Allow embedding on our own site
            }
        });

    } catch (e: any) {
        return new NextResponse(`Proxy Error: ${e.message}`, { status: 500 });
    }
}
