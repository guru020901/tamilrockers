"use client";

import { useEffect } from "react";

/**
 * 🦁 BRAVE SHIELD: Cosmetic Filtering & Popup Blocking
 * Implements "Brave Browser" style ad-blocking logic within the application scope.
 */
export const BraveShield = () => {
    useEffect(() => {
        // 1. 🛡️ Global Popup/Popunder Killer
        // Intercepts window.open calls that might try to escape iframes or run on the main page.
        const originalOpen = window.open;
        window.open = function (url?: string | URL, target?: string, features?: string) {
            console.log(`[BraveShield] 🦁 Blocked popup attempt to: ${url}`);
            // Allow internal links or harmless navigations if needed, but for now block all "popups"
            if (target === '_blank' && !features) {
                // Allow standard link clicks (maybe) - usually popups have 'features' params
                return originalOpen.apply(this, arguments as any);
            }
            return null; // Block it
        };

        // 2. 🛡️ Cosmetic Filtering (EasyList-ish)
        // We inject a style tag that mimics standard ad-blocker CSS rules
        const style = document.createElement('style');
        style.id = 'brave-shield-css';
        style.innerHTML = `
            /* Common Ad Container Classes */
            .adsbox, .ad-box, .ad-container, .ad-wrapper, .ad-slot,
            [id^="google_ads"], [id^="div-gpt-ad"], [class^="ad_"], [class*=" ad "],
            .popup-overlay, .popunder,
            /* Specific sticky floating ads */
            div[style*="z-index: 2147483647"], 
            div[style*="z-index: 9999999"] {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
                width: 0 !important;
                height: 0 !important;
            }
            
            /* Hide iframes that are likely ads (not our player) */
            iframe[src*="doubleclick"], iframe[src*="google"], iframe[src*="adsystem"] {
                display: none !important;
            }
        `;
        document.head.appendChild(style);

        // 3. 🛡️ Mutation Observer (Active DOM Sanitization)
        // Watches for new elements injected (common in aggressive ad scripts)
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        // Check for suspicious high z-index (overlays)
                        const zIndex = parseInt(window.getComputedStyle(node).zIndex);
                        if (zIndex > 10000 && !node.classList.contains('brave-allow')) {
                            console.log('[BraveShield] 🦁 Nuke suspicious overlay:', node);
                            node.remove();
                        }
                        // Check for ad script execution
                        if (node.tagName === 'SCRIPT' && (node as HTMLScriptElement).src.includes('pop')) {
                            node.remove();
                        }
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            // Restore window.open? Maybe keep it blocked.
            // document.head.removeChild(style);
            observer.disconnect();
        };
    }, []);

    return null; // Headless component
};
