'use client';

import React, { useRef, useState, useEffect } from 'react';
import { AlertCircle, Server, Cloud, Database, ShieldCheck, Play, Shield, Loader, Activity, Zap } from 'lucide-react';
import ReactHlsPlayer from 'react-hls-player';

interface VideoPlayerProps {
    magnets: string[]; // Accept ALL magnets
    imdb?: string;
    watch?: string;
}

const SERVERS = [
    { name: 'Quantum Server (Fast)', url: 'https://vidsrc.to/embed/movie/' },
    { name: 'Nebula Stream', url: 'https://vidsrc.xyz/embed/movie?imdb=' },
    { name: 'Stellar Mirror', url: 'https://www.2embed.cc/embed/' },
    { name: 'Galaxy Node', url: 'https://autoembed.co/movie/imdb/' },
    { name: 'Vortex API', url: 'https://moviesapi.club/movie/' }
];

const VideoPlayer: React.FC<VideoPlayerProps> = ({ magnets, imdb, watch }) => {
    // If no IMDB and no magnets, show a helpful message
    // Default to Cloud if IMDB exists, else Native if watch exists, else P2P
    const getDefaultMode = () => {
        if (imdb) return 'cloud';
        if (watch) return 'native';
        if (magnets && magnets.length > 0) return 'p2p';
        return 'cloud'; // Fallback to cloud with manual input
    };

    const [mode, setMode] = useState<'native' | 'native-iframe' | 'cloud' | 'p2p'>(getDefaultMode());
    const [activeServer, setActiveServer] = useState(0);

    // Manual IMDB input for when auto-detection fails
    const [manualImdb, setManualImdb] = useState<string>('');
    const effectiveImdb = imdb || manualImdb;

    // Magnet Swarm Logic
    const [magnetIndex, setMagnetIndex] = useState(0);
    const [streamUrl, setStreamUrl] = useState<string>('');
    const [swarmStatus, setSwarmStatus] = useState<string>('');

    // Native Mode State
    const [nativeUrl, setNativeUrl] = useState<string | null>(null);
    const [isSniffing, setIsSniffing] = useState(false);
    const [sniffStatus, setSniffStatus] = useState('');

    const [error, setError] = useState<string | null>(null);
    const playerRef = useRef<HTMLVideoElement>(null);

    // Sniffer Logic (Native Mode)
    useEffect(() => {
        if (mode === 'native' && watch && !nativeUrl) {
            // On Vercel/production, skip localhost sniffing and go directly to iframe
            const isProduction = typeof window !== 'undefined' &&
                !window.location.hostname.includes('localhost') &&
                !window.location.hostname.includes('127.0.0.1');

            if (isProduction) {
                // Skip localhost sniffing, directly use proxy iframe
                setSniffStatus('Native Stream Ready (Proxy Mode)');
                setTimeout(() => setMode('native-iframe'), 500);
                return;
            }

            // Local development: try localhost sniffing
            setIsSniffing(true);
            setError(null);
            setSniffStatus('Initializing High-Tech Stream Sniffer...');

            // Timeout to force fallback if sniffing takes too long (15s)
            const fallbackTimer = setTimeout(() => {
                if (isSniffing) {
                    setSniffStatus('Sniffer timed out. Switching to Direct Embed...');
                    setTimeout(() => setMode('native-iframe'), 1000);
                }
            }, 15000);

            const sniffStream = async () => {
                try {
                    // 1. Try AdBlock Proxy (Fast)
                    setSniffStatus('Attempting Deep Packet Extraction...');
                    const proxyRes = await fetch(`http://localhost:3007/api/sniff?url=${encodeURIComponent(watch)}`);
                    const proxyData = await proxyRes.json();

                    if (proxyData.success && proxyData.streamUrl) {
                        setNativeUrl(proxyData.streamUrl);
                        setSniffStatus('Stream Locked 🔓');
                        setIsSniffing(false);
                        clearTimeout(fallbackTimer);
                        return;
                    }

                    throw new Error("Sniff failed");
                } catch (e) {
                    setSniffStatus('Extraction failed. Switching to Direct Embed.');
                    setTimeout(() => setMode('native-iframe'), 1500);
                }
            };

            sniffStream();
            return () => clearTimeout(fallbackTimer);
        }
    }, [mode, watch, nativeUrl, isSniffing]); // Added nativeUrl and isSniffing to dependencies

    // Initial Stream Setup
    useEffect(() => {
        if (mode === 'p2p' && magnets.length > 0) {
            const currentMagnet = magnets[magnetIndex];
            setStreamUrl(`http://localhost:3005/stream?magnet=${encodeURIComponent(currentMagnet)}`);
            setSwarmStatus(`Connecting to Swarm ${magnetIndex + 1}/${magnets.length}...`);
            setError(null);
        }
    }, [magnetIndex, mode, magnets]);

    // Swarm Health Monitor (Auto-Switch)
    const [useHybrid, setUseHybrid] = useState(false);

    useEffect(() => {
        if (mode !== 'p2p') {
            setUseHybrid(false); // Reset when changing modes manually
            return;
        }

        let stallCount = 0;
        const healthCheck = setInterval(async () => {
            try {
                // If we already activated hybrid mode, check if we scraped an IMDB ID
                if (useHybrid) return;

                const res = await fetch('http://localhost:3005/health');
                const data = await res.json();

                if (data.peers > 0 && data.downloadSpeed > 500) {
                    setSwarmStatus(`Swarm Active: ${data.peers} Peers @ ${(data.downloadSpeed / 1024).toFixed(0)} KB/s`);
                    stallCount = 0;
                } else {
                    stallCount++;
                    setSwarmStatus(`Searching for Peers... (${stallCount}s)`);
                }

                // SMART FORMAT DETECTION (New Tech)
                if (data.type && (data.type === 'mkv' || data.type === 'avi')) {
                    setSwarmStatus(`Quantum Transcoder Active: Converting .${data.type.toUpperCase()} to MP4...`);
                    // We DO NOT switch to hybrid anymore. The backend handles it.
                    stallCount = 0; // Reset stall count as transcoding takes a moment to warm up
                }

                // FAILSAFE: If stalled for > 15s (Dead Swarm OR Slow Transcode), Switch to Hybrid
                if (stallCount > 15) {
                    if (magnetIndex < magnets.length - 1) {
                        setSwarmStatus(`Source Unstable. Hopping to Magnet #${magnetIndex + 2}...`);
                        setTimeout(() => {
                            setMagnetIndex(prev => prev + 1);
                            stallCount = 0;
                        }, 1000);
                    } else if (imdb) {
                        // All magnets failed? Activate HYBRID MODE (Cloud Injection)
                        setSwarmStatus('Swarm/Transcoder Failed. Rerouting to Neural Cloud...');
                        setTimeout(() => setUseHybrid(true), 2500);
                        clearInterval(healthCheck);
                    }
                }
            } catch (e) { }
        }, 1000);

        return () => clearInterval(healthCheck);
    }, [mode, magnetIndex, magnets, imdb, useHybrid]);

    const getCloudUrl = () => SERVERS[activeServer].url + effectiveImdb;

    return (
        <div style={{ width: '100%', background: '#0a0a0a', borderRadius: '16px', overflow: 'hidden', border: '1px solid #333', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            {/* Mode Switcher */}
            <div style={{ display: 'flex', background: '#111', borderBottom: '1px solid #222', overflowX: 'auto' }}>
                {watch && (
                    <button
                        onClick={() => setMode('native')}
                        style={{
                            flex: 1, padding: '14px', background: (mode === 'native' || mode === 'native-iframe') ? '#1a1a1a' : 'transparent',
                            border: 'none', color: (mode === 'native' || mode === 'native-iframe') ? '#ff5722' : '#666',
                            cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            borderBottom: (mode === 'native' || mode === 'native-iframe') ? '2px solid #ff5722' : 'none', minWidth: '120px'
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
                    <Database size={18} /> {useHybrid ? 'HYBRID P2P' : 'P2P'}
                </button>
            </div>

            {/* Cloud Server Selector */}
            {(mode === 'cloud' || (mode === 'p2p' && useHybrid)) && (
                <div style={{ display: 'flex', gap: '8px', padding: '10px 15px', background: '#050505', borderBottom: '1px solid #222' }}>
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

            {/* Manual IMDB Input - Shown when auto-detection failed */}
            {mode === 'cloud' && !imdb && (
                <div style={{ padding: '15px', background: '#111', borderBottom: '1px solid #333' }}>
                    <div style={{ color: '#ff9800', fontSize: '0.85rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={16} /> IMDB ID not found automatically. Enter manually to stream:
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
                            href={`https://www.google.com/search?q=${encodeURIComponent('Mask 2025 imdb')}`}
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

            {/* Player Viewport */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}>

                {/* P2P MODE */}
                {mode === 'p2p' && (
                    useHybrid ? (
                        <div style={{ width: '100%', height: '100%' }}>
                            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'linear-gradient(90deg, #6200ea, #b388ff)', padding: '5px 10px', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 0 10px rgba(98, 0, 234, 0.5)' }}>
                                <Zap size={14} style={{ fill: '#fff' }} /> CLOUD NEURAL NETWORK
                            </div>

                            {/* Loading Overlay */}
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', background: 'black', animation: 'fadeOut 3s forwards', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ color: '#b388ff', fontWeight: 'bold', fontSize: '1.2rem' }}>
                                    Accelerating Stream...
                                </div>
                            </div>

                            <iframe
                                src={getCloudUrl()}
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                allowFullScreen
                                allow="autoplay; encrypted-media"
                            />
                        </div>
                    ) : (
                        streamUrl && (
                            <div style={{ width: '100%', height: '100%' }}>
                                {/* Reroute Overlay managed by useEffect messages */}
                                {sniffStatus && (
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 20, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#00e5ff' }}>
                                        <Activity size={48} style={{ animation: 'pulse 1s infinite' }} />
                                        <h3 style={{ marginTop: '20px' }}>{sniffStatus}</h3>
                                    </div>
                                )}
                                <video
                                    src={streamUrl}
                                    controls
                                    autoPlay
                                    style={{ width: '100%', height: '100%' }}
                                    onError={() => setError("P2P Connection Failed")}
                                >
                                </video>
                            </div>
                        )
                    )
                )}

                {mode === 'native-iframe' && watch && (
                    <div style={{ width: '100%', height: '100%' }}>
                        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'rgba(76, 175, 80, 0.9)', padding: '5px 10px', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ShieldCheck size={14} /> Native Ad-Free (Proxy)
                        </div>
                        <iframe
                            src={`/api/proxy?url=${encodeURIComponent(watch)}`}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            allowFullScreen
                            allow="autoplay; encrypted-media"
                        />
                    </div>
                )}

                {/* NATIVE MODE - HLS Sniffer */}
                {mode === 'native' && (
                    isSniffing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ff5722' }}>
                            <Loader size={48} style={{ animation: 'spin 1s linear infinite' }} />
                            <div style={{ marginTop: '20px', fontFamily: 'monospace', fontSize: '1.2rem' }}>{sniffStatus}</div>
                            <div style={{ marginTop: '10px', color: '#666', fontSize: '0.9rem' }}>Bypassing Ad-Blockers & Extracting HLS...</div>
                        </div>
                    ) : nativeUrl ? (
                        <div style={{ width: '100%', height: '100%' }}>
                            <ReactHlsPlayer
                                src={nativeUrl}
                                autoPlay={true}
                                controls={true}
                                width="100%"
                                height="100%"
                                playerRef={playerRef as React.RefObject<HTMLVideoElement>}
                                style={{ outline: 'none' }}
                            />
                        </div>
                    ) : null // Should have switched to iframe by now
                )}

                {/* CLOUD MODE */}
                {mode === 'cloud' && (
                    imdb ? (
                        <iframe
                            key={activeServer}
                            src={getCloudUrl()}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            allowFullScreen
                            allow="autoplay; encrypted-media"
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
                            <AlertCircle size={40} /> No IMDB Data
                        </div>
                    )
                )}

                {/* P2P MODE */}
                {mode === 'p2p' && streamUrl && (
                    <video
                        src={streamUrl}
                        controls
                        autoPlay
                        style={{ width: '100%', height: '100%' }}
                        onError={() => setError("P2P Connection Failed")}
                    >
                    </video>
                )}
            </div>

            <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
};

export default VideoPlayer;
