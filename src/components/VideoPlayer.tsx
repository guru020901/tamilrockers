'use client';

import React, { useRef, useState, useEffect } from 'react';
import ReactHlsPlayer from 'react-hls-player';
import { AlertCircle, Server, Cloud, Database, ShieldCheck, Play, Shield, Loader, Activity, Zap, ExternalLink } from 'lucide-react';

interface VideoPlayerProps {
    magnets: string[];
    imdb?: string;
    watch?: string;
    title?: string; // For auto IMDB lookup
}

const SERVERS = [
    { name: 'Quantum Server', url: 'https://vidsrc.to/embed/movie/' },
    { name: 'Nebula Stream', url: 'https://vidsrc.xyz/embed/movie?imdb=' },
    { name: 'Stellar Mirror', url: 'https://www.2embed.cc/embed/' },
    { name: 'Galaxy Node', url: 'https://autoembed.co/movie/imdb/' },
    { name: 'Vortex API', url: 'https://moviesapi.club/movie/' }
];

const VideoPlayer: React.FC<VideoPlayerProps> = ({ magnets, imdb, watch, title }) => {
    // Default mode selection based on available data
    const getDefaultMode = () => {
        if (imdb) return 'cloud';
        if (watch) return 'native-direct'; // Start with direct, upgrade to clean if possible
        if (magnets && magnets.length > 0) return 'p2p';
        return 'cloud';
    };

    const [mode, setMode] = useState<'native-direct' | 'native-clean' | 'cloud' | 'p2p'>(getDefaultMode());
    const [activeServer, setActiveServer] = useState(0);

    // IMDB state
    const [manualImdb, setManualImdb] = useState<string>('');
    const [autoImdb, setAutoImdb] = useState<string | null>(null);
    const [lookingUpImdb, setLookingUpImdb] = useState(false);
    const effectiveImdb = imdb || autoImdb || manualImdb;

    // Magnet state
    const [magnetIndex, setMagnetIndex] = useState(0);
    const [streamUrl, setStreamUrl] = useState<string>('');
    const [swarmStatus, setSwarmStatus] = useState<string>('');

    // Native Clean State
    const [cleanUrl, setCleanUrl] = useState<string>('');
    const [cleanType, setCleanType] = useState<string>('');
    const [isExtracting, setIsExtracting] = useState(false);
    const playerRef = useRef<HTMLVideoElement>(null);

    // Error state
    const [iframeError, setIframeError] = useState(false);

    // Effect: Try to extract clean stream when watch URL is available
    useEffect(() => {
        if (watch && (mode === 'native-direct' || mode === 'native-clean')) {
            const extractStream = async () => {
                if (cleanUrl) return; // Already extracted

                setIsExtracting(true);
                try {
                    const res = await fetch(`/api/extract?url=${encodeURIComponent(watch)}`);
                    const data = await res.json();

                    if (data.success && data.streamUrl) {
                        console.log('[Direct Stream] Extracted:', data.streamUrl);
                        setCleanUrl(data.streamUrl);
                        setCleanType(data.type);
                        setMode('native-clean');
                    }
                } catch (e) {
                    console.error('[Direct Stream] Extraction failed:', e);
                } finally {
                    setIsExtracting(false);
                }
            };

            // Short delay to allow UI to settle
            const timer = setTimeout(extractStream, 500);
            return () => clearTimeout(timer);
        }
    }, [watch, cleanUrl, mode]);

    // Auto IMDB lookup based on title
    useEffect(() => {
        if (!imdb && !autoImdb && title && mode === 'cloud') {
            setLookingUpImdb(true);

            // Extract clean movie name and year
            const cleanTitle = title.replace(/Download|Tamil|Telugu|Hindi|Malayalam|Kannada|Review|Online|HD|Full|Movie/gi, '').trim();
            const yearMatch = title.match(/\((\d{4})\)/);
            const year = yearMatch ? yearMatch[1] : '';
            const searchQuery = `${cleanTitle} ${year}`.trim();

            // Use OMDB API (free tier - 1000 requests/day)
            const lookupImdb = async () => {
                try {
                    const omdbKey = 'trilogy'; // Public demo key
                    const res = await fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(searchQuery)}&apikey=${omdbKey}`);
                    const data = await res.json();

                    if (data.imdbID) {
                        setAutoImdb(data.imdbID);
                        console.log(`[IMDB Lookup] Found: ${data.imdbID} for "${searchQuery}"`);
                    }
                } catch (e) {
                    console.log('[IMDB Lookup] Failed:', e);
                } finally {
                    setLookingUpImdb(false);
                }
            };

            lookupImdb();
        }
    }, [imdb, autoImdb, title, mode]);

    // P2P Stream setup
    useEffect(() => {
        if (mode === 'p2p' && magnets.length > 0) {
            const currentMagnet = magnets[magnetIndex];
            setStreamUrl(`http://localhost:3005/stream?magnet=${encodeURIComponent(currentMagnet)}`);
            setSwarmStatus(`Connecting to Swarm ${magnetIndex + 1}/${magnets.length}...`);
        }
    }, [magnetIndex, mode, magnets]);

    const getCloudUrl = () => SERVERS[activeServer].url + effectiveImdb;

    // Handle iframe error
    const handleIframeError = () => {
        setIframeError(true);
    };

    // --- ENHANCED PLAYER LOGIC ---
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [showControls, setShowControls] = useState(true);

    const onPlay = () => { setIsPlaying(true); setIsBuffering(false); };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);

    const togglePlay = () => {
        if (playerRef.current) {
            playerRef.current.paused ? playerRef.current.play() : playerRef.current.pause();
        }
    };

    const toggleFullscreen = () => {
        const wrapper = playerRef.current?.parentElement;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else if (wrapper) {
            wrapper.requestFullscreen();
        }
    };

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!playerRef.current) return;
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

            const video = playerRef.current;
            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    video.paused ? video.play() : video.pause();
                    break;
                case 'f':
                    e.preventDefault();
                    document.fullscreenElement ? document.exitFullscreen() : video.parentElement?.requestFullscreen();
                    break;
                case 'arrowright':
                    e.preventDefault();
                    video.currentTime += 10;
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    video.currentTime -= 10;
                    break;
                case 'm':
                    e.preventDefault();
                    video.muted = !video.muted;
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [cleanUrl]);

    // Cinematic Mode State
    const [isCinematic, setIsCinematic] = useState(false);
    const [adShieldActive, setAdShieldActive] = useState(true);

    const toggleCinematic = () => setIsCinematic(!isCinematic);
    const unlockAdShield = () => setAdShieldActive(false);

    // Dynamic Styles for Cinematic Mode
    const containerStyle: React.CSSProperties = isCinematic ? {
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999,
        background: '#000', borderRadius: 0
    } : {
        width: '100%', background: '#0a0a0a', borderRadius: '16px', overflow: 'hidden',
        border: '1px solid #333', boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        position: 'relative', zIndex: 1
    };

    return (
        <div style={containerStyle}>
            {/* Mode Switcher (Hidden in Cinematic unless hovered) */}
            <div style={{
                display: 'flex', background: isCinematic ? 'rgba(0,0,0,0.8)' : '#111',
                borderBottom: '1px solid #222', overflowX: 'auto',
                position: isCinematic ? 'absolute' : 'static', top: 0, left: 0, right: 0, zIndex: 50,
                opacity: (isCinematic && !showControls) ? 0 : 1, transition: 'opacity 0.3s'
            }}>
                {watch && (
                    <button
                        onClick={() => { setMode(cleanUrl ? 'native-clean' : 'native-direct'); setIframeError(false); }}
                        style={{
                            flex: 1, padding: '14px', background: mode.includes('native') ? '#1a1a1a' : 'transparent',
                            border: 'none', color: mode.includes('native') ? '#ff5722' : '#666',
                            cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            borderBottom: mode.includes('native') ? '2px solid #ff5722' : 'none', minWidth: '120px'
                        }}
                    >
                        {isExtracting ? <Loader size={18} className="animate-spin" /> : <Activity size={18} />}
                        {mode === 'native-clean' ? 'NATIVE CLEAN' : 'NATIVE DIRECT'}
                    </button>
                )}
                <button
                    onClick={() => setMode('cloud')}
                    style={{
                        flex: 1, padding: '14px', background: mode === 'cloud' ? '#1a1a1a' : 'transparent',
                        border: 'none', color: mode === 'cloud' ? '#00e5ff' : '#666',
                        cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        borderBottom: mode === 'cloud' ? '2px solid #00e5ff' : 'none', minWidth: '100px'
                    }}
                >
                    <Cloud size={18} /> CLOUD
                </button>
                <button
                    onClick={() => setMode('p2p')}
                    style={{
                        flex: 1, padding: '14px', background: mode === 'p2p' ? '#1a1a1a' : 'transparent',
                        border: 'none', color: mode === 'p2p' ? '#00ff00' : '#666',
                        cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        borderBottom: mode === 'p2p' ? '2px solid #00ff00' : 'none', minWidth: '100px'
                    }}
                >
                    <Database size={18} /> P2P
                </button>

                {/* Cinematic Toggle */}
                <button
                    onClick={toggleCinematic}
                    style={{
                        padding: '0 20px', background: isCinematic ? '#4CAF50' : 'transparent',
                        border: 'none', color: isCinematic ? '#fff' : '#666',
                        cursor: 'pointer', fontWeight: 'bold', borderLeft: '1px solid #222'
                    }}
                    title="Toggle Cinematic Mode"
                >
                    {isCinematic ? <Shield size={18} /> : <div style={{ border: '2px solid currentColor', width: '16px', height: '10px', borderRadius: '2px' }} />}
                </button>
            </div>

            {/* Cloud Server Selector */}
            {mode === 'cloud' && (
                <div style={{ display: 'flex', gap: '8px', padding: '10px 15px', background: '#050505', borderBottom: '1px solid #222', flexWrap: 'wrap' }}>
                    {SERVERS.map((server, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveServer(idx)}
                            style={{
                                padding: '6px 12px',
                                background: activeServer === idx ? '#00e5ff22' : '#222',
                                border: `1px solid ${activeServer === idx ? '#00e5ff' : '#333'}`,
                                borderRadius: '4px', color: activeServer === idx ? '#00e5ff' : '#888',
                                fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <Server size={12} /> {server.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Manual IMDB Input */}
            {mode === 'cloud' && !effectiveImdb && !lookingUpImdb && (
                <div style={{ padding: '15px', background: '#111', borderBottom: '1px solid #333' }}>
                    <div style={{ color: '#ff9800', fontSize: '0.85rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={16} /> IMDB ID not found. Enter manually:
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            placeholder="Enter IMDB ID (e.g., tt1234567)"
                            value={manualImdb}
                            onChange={(e) => setManualImdb(e.target.value)}
                            style={{
                                flex: 1, padding: '10px 15px', background: '#222', border: '1px solid #444',
                                borderRadius: '6px', color: '#fff', fontSize: '0.9rem'
                            }}
                        />
                        <a
                            href={`https://www.google.com/search?q=${encodeURIComponent((title || 'movie') + ' imdb')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                padding: '10px 15px', background: '#00e5ff22', border: '1px solid #00e5ff',
                                borderRadius: '6px', color: '#00e5ff', textDecoration: 'none', fontSize: '0.9rem'
                            }}
                        >
                            Find on Google
                        </a>
                    </div>
                </div>
            )}

            {/* IMDB Lookup Loading */}
            {mode === 'cloud' && lookingUpImdb && (
                <div style={{ padding: '15px', background: '#111', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '10px', color: '#00e5ff' }}>
                    <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Auto-searching IMDB...
                </div>
            )}

            {/* Player Viewport */}
            <div style={{ position: 'relative', width: '100%', height: isCinematic ? '100%' : 'auto', aspectRatio: isCinematic ? 'auto' : '16/9', background: '#000' }}>

                {/* NATIVE CLEAN MODE - Direct extracted stream logic */}
                {mode === 'native-clean' && (
                    <div
                        style={{ width: '100%', height: '100%', position: 'relative', background: '#000', cursor: showControls ? 'default' : 'none' }}
                        onDoubleClick={toggleFullscreen}
                        onMouseEnter={() => setShowControls(true)}
                        onMouseLeave={() => isPlaying && setShowControls(false)}
                    >
                        <div style={{
                            position: 'absolute', top: 10, left: 10, zIndex: 20,
                            background: 'linear-gradient(90deg, #00C9FF 0%, #92FE9D 100%)',
                            padding: '5px 12px', borderRadius: '4px', color: '#000',
                            fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px',
                            opacity: showControls ? 1 : 0, transition: 'opacity 0.3s ease'
                        }}>
                            <Zap size={14} fill="currentColor" /> Ad-Free Clean Player
                        </div>

                        {/* Buffering Indicator */}
                        {isBuffering && (
                            <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                zIndex: 30, pointerEvents: 'none'
                            }}>
                                <Loader size={48} className="animate-spin" color="#00e5ff" />
                            </div>
                        )}

                        {/* Click Overlay (Play/Pause) */}
                        <div
                            style={{ position: 'absolute', inset: 0, zIndex: 10 }}
                            onClick={togglePlay}
                        />

                        {cleanType === 'hls' ? (
                            <ReactHlsPlayer
                                playerRef={playerRef as any}
                                src={cleanUrl}
                                autoPlay
                                controls
                                width="100%"
                                height="100%"
                                style={{ background: '#000', outline: 'none' }}
                                onPlay={onPlay}
                                onPause={onPause}
                                onWaiting={onWaiting}
                                onPlaying={onPlaying}
                            />
                        ) : (
                            <video
                                ref={playerRef}
                                src={cleanUrl}
                                controls
                                autoPlay
                                style={{ width: '100%', height: '100%', background: '#000', outline: 'none' }}
                                onPlay={onPlay}
                                onPause={onPause}
                                onWaiting={onWaiting}
                                onPlaying={onPlaying}
                            />
                        )}
                    </div>
                )}

                {/* NATIVE DIRECT MODE - Fallback to Embed with Ad-Shield */}
                {mode === 'native-direct' && watch && (
                    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'rgba(255, 87, 34, 0.9)', padding: '5px 10px', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ShieldCheck size={14} /> Native Direct Embed
                        </div>

                        {/* Ad-Shield Overlay */}
                        {adShieldActive && !iframeError && (
                            <div
                                onClick={unlockAdShield}
                                style={{
                                    position: 'absolute', inset: 0, zIndex: 20,
                                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', transition: 'opacity 0.3s'
                                }}
                            >
                                <div style={{
                                    padding: '20px 40px', background: '#ff5722', borderRadius: '50px',
                                    display: 'flex', alignItems: 'center', gap: '15px',
                                    boxShadow: '0 0 30px rgba(255, 87, 34, 0.6)', transform: 'scale(1.1)'
                                }}>
                                    <Play size={32} fill="white" />
                                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Click to Unlock Stream</span>
                                </div>
                                <p style={{ marginTop: '20px', color: '#aaa', fontSize: '0.9rem' }}>
                                    <Shield size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '5px' }} />
                                    Ad-Shield Active: Popups blocked
                                </p>
                            </div>
                        )}

                        {iframeError ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                                <AlertCircle size={40} />
                                <p style={{ marginTop: '15px' }}>Stream blocked. Opening in new tab...</p>
                                <a
                                    href={watch}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        marginTop: '15px', padding: '10px 20px', background: '#ff5722',
                                        borderRadius: '8px', color: '#fff', textDecoration: 'none',
                                        display: 'flex', alignItems: 'center', gap: '8px'
                                    }}
                                >
                                    <ExternalLink size={16} /> Open Video Player
                                </a>
                            </div>
                        ) : (
                            <iframe
                                src={watch}
                                style={{ width: '100%', height: '100%', border: 'none', pointerEvents: adShieldActive ? 'none' : 'auto' }}
                                allowFullScreen
                                allow="autoplay; fullscreen; encrypted-media"
                                referrerPolicy="no-referrer"
                                onError={handleIframeError}
                            />
                        )}
                    </div>
                )}

                {/* CLOUD MODE */}
                {mode === 'cloud' && (
                    effectiveImdb ? (
                        <iframe
                            key={`${activeServer}-${effectiveImdb}`}
                            src={getCloudUrl()}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            allowFullScreen
                            allow="autoplay; encrypted-media"
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', flexDirection: 'column', gap: '10px' }}>
                            <Cloud size={40} />
                            <p>Enter IMDB ID above to stream</p>
                        </div>
                    )
                )}

                {/* P2P MODE */}
                {mode === 'p2p' && (
                    magnets.length > 0 ? (
                        <div style={{ width: '100%', height: '100%' }}>
                            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'rgba(0, 255, 0, 0.2)', padding: '5px 10px', borderRadius: '4px', color: '#00ff00', fontSize: '0.75rem' }}>
                                {swarmStatus}
                            </div>
                            <video
                                src={streamUrl}
                                controls
                                autoPlay
                                style={{ width: '100%', height: '100%' }}
                            />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                            <Database size={40} />
                            <p style={{ marginLeft: '10px' }}>No P2P sources available</p>
                        </div>
                    )
                )}
            </div>

            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default VideoPlayer;
