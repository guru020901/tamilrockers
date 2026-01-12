'use client';

import React, { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';
import 'plyr/dist/plyr.css';

// Dynamic import for Plyr to avoid SSR issues
interface AdvancedPlayerProps {
    src: string;
    type: 'hls' | 'mp4';
    poster?: string;
    onReady?: () => void;
    onPlay?: () => void;
    onPause?: () => void;
    onError?: (error: Error) => void;
}

/**
 * 🎬 ADVANCED VIDEO PLAYER
 */
const AdvancedPlayer: React.FC<AdvancedPlayerProps> = ({
    src,
    type,
    poster,
    onReady,
    onPlay,
    onPause,
    onError
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const plyrRef = useRef<any>(null); // Store Plyr instance
    const [isLoading, setIsLoading] = useState(true);
    const [qualityLevels, setQualityLevels] = useState<number[]>([]);
    const [showDoubleTapOverlay, setShowDoubleTapOverlay] = useState<'left' | 'right' | null>(null);

    // Mobile Double Tap Logic
    const lastTapRef = useRef<{ time: number, side: 'left' | 'right' | 'center' }>({ time: 0, side: 'center' });

    const handleTouchEnd = (e: React.TouchEvent) => {
        const now = Date.now();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.changedTouches[0].clientX - rect.left;
        const width = rect.width;

        let side: 'left' | 'right' | 'center' = 'center';
        if (x < width * 0.35) side = 'left';
        else if (x > width * 0.65) side = 'right';

        if (now - lastTapRef.current.time < 300 && lastTapRef.current.side === side && side !== 'center') {
            // Double Tap Detected!
            if (side === 'left') {
                if (plyrRef.current) plyrRef.current.rewind(10);
                setShowDoubleTapOverlay('left');
            } else {
                if (plyrRef.current) plyrRef.current.forward(10);
                setShowDoubleTapOverlay('right');
            }
            setTimeout(() => setShowDoubleTapOverlay(null), 600);
        }

        lastTapRef.current = { time: now, side };
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        let plyrInstance: any;

        const initPlayer = async () => {
            // Dynamic import plyr
            const Plyr = (await import('plyr')).default;

            // Initialize Plyr
            plyrInstance = new Plyr(video, {
                controls: [
                    'play-large', 'play', 'rewind', 'fast-forward',
                    'progress', 'current-time', 'duration', 'mute',
                    'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'
                ],
                settings: ['quality', 'speed', 'loop'],
                speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
                keyboard: { focused: true, global: true }, // Enable global keyboard shortcuts
                tooltips: { controls: true, seek: true },
                i18n: {
                    speed: 'Speed',
                    quality: 'Quality'
                },
                seekTime: 10, // Explicit 10s seek
                resetOnEnd: true,
                // Force controls to be visible on mobile
                hideControls: true,
            });
            plyrRef.current = plyrInstance;
        };

        // Initialize HLS
        if (type === 'hls' && Hls.isSupported()) {
            const hls = new Hls({
                // ⚡ ULTRA-FAST ENTERPRISE CONFIG
                autoStartLoad: true,
                startLevel: 0,
                capLevelToPlayerSize: true,
                enableWorker: true,
                lowLatencyMode: true,
                // ... (Reuse robust config)
                // === INSTANT STARTUP ===
                startPosition: -1,
                testBandwidth: false,

                // === AGGRESSIVE BUFFERING ===
                maxBufferLength: 180,
                maxMaxBufferLength: 900,
                maxBufferSize: 180 * 1000 * 1000,

                // === ULTRA-FAST LOADING ===
                manifestLoadingTimeOut: 5000,
                manifestLoadingMaxRetry: 5,
                levelLoadingTimeOut: 5000,
                fragLoadingTimeOut: 10000,

                // === SMART ABR ===
                abrEwmaFastLive: 1.5,
                abrBandWidthFactor: 0.95,
                abrBandWidthUpFactor: 0.85,
            });

            hls.loadSource(src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                setQualityLevels(data.levels.map((l, i) => l.height || i));

                // Init Plyr after HLS is ready
                initPlayer().then(() => {
                    setIsLoading(false);
                    onReady?.();
                    // video.play().catch(() => {}); // Autoplay handled by Plyr or user
                });
            });

            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) {
                    // ... error handling
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
                    else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                    else onError?.(new Error(data.details));
                }
            });

            hlsRef.current = hls;

        } else {
            // Native HLS/MP4
            video.src = src;
            initPlayer().then(() => {
                setIsLoading(false);
                onReady?.();
            });
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
            if (plyrRef.current) {
                plyrRef.current.destroy();
                plyrRef.current = null;
            }
        };
    }, [src, type]);

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            background: '#000',
            borderRadius: '8px',
            overflow: 'hidden'
        }}
            onTouchEnd={handleTouchEnd}
        >
            {/* CSS for Mobile Optimization */}
            <style>{`
                /* Force Rewind/Forward buttons to show on mobile */
                .plyr__controls .plyr__control[data-plyr="rewind"],
                .plyr__controls .plyr__control[data-plyr="fast-forward"] {
                    display: flex !important;
                }
                
                /* Make controls bigger on mobile */
                @media (max-width: 768px) {
                    .plyr__controls .plyr__control {
                        padding: 10px; 
                    }
                    /* Hide volume intensity on mobile to save space */
                    .plyr__volume { display: none; }
                }

                /* Double Tap Animation */
                @keyframes fadeOut {
                    0% { opacity: 1; transform: scale(1); }
                    100% { opacity: 0; transform: scale(1.5); }
                }
            `}</style>

            {/* Double Tap Overlay Indicators */}
            {showDoubleTapOverlay && (
                <div style={{
                    position: 'absolute', top: '50%',
                    left: showDoubleTapOverlay === 'left' ? '20%' : 'auto',
                    right: showDoubleTapOverlay === 'right' ? '20%' : 'auto',
                    transform: 'translateY(-50%)',
                    zIndex: 20, pointerEvents: 'none',
                    background: 'rgba(0,0,0,0.6)',
                    borderRadius: '50%', width: '60px', height: '60px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '12px', fontWeight: 'bold',
                    border: '2px solid rgba(255,255,255,0.3)',
                    animation: 'fadeOut 0.6s forwards'
                }}>
                    {showDoubleTapOverlay === 'left' ? '« 10s' : '10s »'}
                </div>
            )}

            {/* Loading Overlay */}
            {isLoading && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.8)', zIndex: 10, pointerEvents: 'none'
                }}>
                    <div style={{
                        width: '50px', height: '50px', border: '4px solid #333', borderTop: '4px solid #00C9FF',
                        borderRadius: '50%', animation: 'spin 1s linear infinite'
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
                </div>
            )}

            <video
                ref={videoRef}
                poster={poster}
                className="plyr-video" // Helper class
                playsInline
                crossOrigin="anonymous"
                style={{ width: '100%', height: '100%' }}
            />
        </div>
    );
};

export default AdvancedPlayer;
