'use client';

import React, { useRef, useState, useEffect } from 'react';
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
        if (watch) return 'native-direct'; // Use direct embed instead of proxy
        if (magnets && magnets.length > 0) return 'p2p';
        return 'cloud';
    };

    const [mode, setMode] = useState<'native-direct' | 'native-proxy' | 'cloud' | 'p2p'>(getDefaultMode());
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

    // Error state
    const [iframeError, setIframeError] = useState(false);

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

    return (
        <div style={{ width: '100%', background: '#0a0a0a', borderRadius: '16px', overflow: 'hidden', border: '1px solid #333', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            {/* Mode Switcher */}
            <div style={{ display: 'flex', background: '#111', borderBottom: '1px solid #222', overflowX: 'auto' }}>
                {watch && (
                    <button
                        onClick={() => { setMode('native-direct'); setIframeError(false); }}
                        style={{
                            flex: 1, padding: '14px', background: mode === 'native-direct' ? '#1a1a1a' : 'transparent',
                            border: 'none', color: mode === 'native-direct' ? '#ff5722' : '#666',
                            cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            borderBottom: mode === 'native-direct' ? '2px solid #ff5722' : 'none', minWidth: '120px'
                        }}
                    >
                        <Activity size={18} /> NATIVE PRO
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
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}>

                {/* NATIVE DIRECT MODE - Embed without proxy */}
                {mode === 'native-direct' && watch && (
                    <div style={{ width: '100%', height: '100%' }}>
                        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'rgba(76, 175, 80, 0.9)', padding: '5px 10px', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ShieldCheck size={14} /> Native Direct Embed
                        </div>

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
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                allowFullScreen
                                allow="autoplay; fullscreen; encrypted-media"
                                referrerPolicy="no-referrer"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
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
