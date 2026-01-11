import { NextResponse } from 'next/server';
import { fetchHtmlWithBypass } from '@/lib/proxy';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) return new NextResponse('URL required', { status: 400 });

    try {
        const origin = new URL(url).origin;
        let html = await fetchHtmlWithBypass(url);

        // 🛡️ QUANTUM SHIELD: Active Ad-Block Injection

        // 1. Inject Base Tag (Fix relative links)
        html = html.replace('<head>', `<head><base href="${origin}/">`);

        // 2. Neutralize Popup Mechanisms (The "Popup Killer" Script)
        // We inject this AT THE VERY TOP of the head so it runs first
        const safetyScript = `
            <script>
                // 🛑 SAFETY OVERRIDE
                window.open = function() { console.log("🚫 Popup Blocked by Quantum Shield"); return null; };
                window.alert = function() { console.log("🚫 Alert Blocked"); };
                window.confirm = function() { return true; };
                // Kill common ad variables
                window.ad_block_detector = undefined;
                window.blockAdBlock = undefined;
            </script>
        `;
        html = html.replace('<head>', '<head>' + safetyScript);

        // 3. Strip Known Malicious Scripts (Regex Heuristics)
        const adPatterns = [
            /<script[^>]*src=["'][^"']*(popunder|pophash|onclick|ad|tracker|analytics)[^"']*["'][^>]*><\/script>/gi,
            /<script[^>]*>[\s\S]*?(window\.open|popunder|newWindow)[\s\S]*?<\/script>/gi,
            // Aggressively remove inline scripts that are short and suspicious (often ad loaders)
            // /<script>[\s\S]{0,500}pophash[\s\S]*?<\/script>/gi 
        ];

        // Clean potentially malicious scripts
        // Note: We have to be careful not to break the player logic
        // For now, relying on the 'safetyScript' override is safer than aggressive stripping.

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html' }
        });

    } catch (e: any) {
        return new NextResponse('Proxy Error', { status: 500 });
    }
}
