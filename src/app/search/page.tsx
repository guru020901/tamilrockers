'use client';

import React, { useState, useEffect } from 'react';
import { Search, Play, Loader, AlertCircle, Database, Globe, Zap, Download, Settings } from 'lucide-react';
import Link from 'next/link';

type SearchSource = '1tamilmv' | 'tpb' | '1337x' | 'rutracker' | 'all';

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<SearchSource>('all');
    const [blockedSources, setBlockedSources] = useState<string[]>([]);

    // Domain configuration from localStorage
    const [domains, setDomains] = useState({
        '1tamilmv': 'https://1tamilmv.do',
        'tpb': 'https://thepibay.site',
        '1337x': 'https://1337x.to',
        'rutracker': 'rutracker.org'
    });

    // Load domains from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('domain_config');
        if (saved) {
            try {
                setDomains(prev => ({ ...prev, ...JSON.parse(saved) }));
            } catch (e) { }
        }
    }, []);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError(null);
        setResults([]);
        setBlockedSources([]);

        try {
            // Define fetchers - USE DOMAINS FROM STATE
            // 1. Search 1TamilMV (via internal proxy)
            const fetch1TamilMV = async () => {
                // Streaming results directly to state
                try {
                    // Using internal API route which proxies to port 3007 (server-side)
                    const d = encodeURIComponent(domains['1tamilmv']);
                    const res = await fetch(`/api/tamilmv?q=${encodeURIComponent(query)}&domain=${d}`);
                    const data = await res.json();
                    if (data.results) {
                        setResults(prev => {
                            const existing = new Set(prev.map(p => p.link));
                            const newItems = data.results.filter((i: any) => !existing.has(i.link)).map((r: any) => ({ ...r, source: '1tamilmv' }));
                            return [...prev, ...newItems];
                        });
                    }
                } catch (e) {
                    console.error('1TamilMV Error:', e);
                    setBlockedSources(prev => [...prev, '1TamilMV']);
                } finally {
                    // Done with 1TamilMV
                }
            };

            // 2. Search Multi-Source (TPB/1337x/RuTracker) via internal proxy
            const fetchMultiSearch = async (srcParam: string) => {
                // Streaming results directly to state
                try {
                    const tpb = encodeURIComponent(domains['tpb']);
                    const x1337 = encodeURIComponent(domains['1337x']);
                    const ru = encodeURIComponent(domains['rutracker']);

                    // Using internal API route which proxies to port 3008
                    const res = await fetch(`/api/torrents?q=${encodeURIComponent(query)}&source=${srcParam}&tpbDomain=${tpb}&x1337Domain=${x1337}&ruDomain=${ru}`);
                    const data = await res.json();

                    // Handle blocked status
                    if (data.status) {
                        if (data.status['1337x'] === 'blocked') setBlockedSources(prev => [...prev, '1337x']);
                    }

                    if (data.results) {
                        setResults(prev => {
                            const existing = new Set(prev.map(p => p.link));
                            const newItems = data.results.filter((i: any) => !existing.has(i.link));
                            return [...prev, ...newItems];
                        });
                    }
                } catch (e) {
                    console.error('Torrent API Error:', e);
                } finally {
                    // Done with multi-search
                }
            };

            // Execution Logic - results stream directly to state
            if (source === 'all') {
                await Promise.all([
                    fetch1TamilMV(),
                    fetchMultiSearch('all')
                ]);
            } else if (source === '1tamilmv') {
                await fetch1TamilMV();
            } else {
                await fetchMultiSearch(source);
            }
        } catch (err) {
            setError('Search service error. Check console.');
        } finally {
            setLoading(false);
        }
    };

    const getSourceBadgeStyle = (src: string) => {
        switch (src) {
            case 'tpb': return { background: '#ffc107', color: '#000' };
            case '1337x': return { background: '#e91e63', color: '#fff' };
            case 'rutracker': return { background: '#2196f3', color: '#fff' };
            case '1tamilmv': return { background: '#4caf50', color: '#fff' };
            default: return { background: '#666', color: '#fff' };
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#000', color: '#fff', padding: '40px 20px' }}>
            {/* Header */}
            <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', marginBottom: '30px' }}>
                <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '10px', background: 'linear-gradient(45deg, #ff5722, #ff9100)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    TorrentRockers
                </h1>
                <p style={{ color: '#888' }}>Multi-Source Torrent Search • TPB • 1337x • 1TamilMV</p>
            </div>

            {/* Source Selector */}
            <div style={{ maxWidth: '600px', margin: '0 auto 20px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {[
                    { id: 'tpb', name: 'ThePirateBay', icon: <Globe size={16} /> },
                    { id: '1337x', name: '1337x', icon: <Zap size={16} /> },
                    { id: 'rutracker', name: 'RuTracker', icon: <Database size={16} /> },
                    { id: '1tamilmv', name: '1TamilMV', icon: <Database size={16} /> },
                    { id: 'all', name: 'All Sources', icon: <Search size={16} /> },
                ].map((s) => (
                    <button
                        key={s.id}
                        onClick={() => setSource(s.id as SearchSource)}
                        style={{
                            padding: '10px 20px',
                            background: source === s.id ? '#ff5722' : '#222',
                            border: source === s.id ? '2px solid #ff5722' : '1px solid #444',
                            borderRadius: '25px',
                            color: source === s.id ? '#fff' : '#888',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: source === s.id ? 'bold' : 'normal',
                            transition: 'all 0.2s'
                        }}
                    >
                        {s.icon} {s.name}
                    </button>
                ))}
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearch} style={{ maxWidth: '600px', margin: '0 auto 50px', position: 'relative' }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search for anything (e.g. Mask, Avengers, Breaking Bad)..."
                    suppressHydrationWarning
                    style={{
                        width: '100%', padding: '20px 25px', paddingRight: '60px',
                        fontSize: '1.2rem', background: '#111', border: '1px solid #333',
                        borderRadius: '50px', color: '#fff', outline: 'none',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                    }}
                />
                <button
                    type="submit"
                    suppressHydrationWarning
                    style={{
                        position: 'absolute', right: '10px', top: '10px',
                        width: '50px', height: '50px', borderRadius: '50%',
                        background: '#ff5722', border: 'none', color: '#fff',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    {loading ? <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={24} />}
                </button>
            </form>

            {/* Error Message */}
            {error && !loading && results.length === 0 && blockedSources.length === 0 && (
                <div style={{ maxWidth: '600px', margin: '0 auto 30px', padding: '20px', background: '#220000', border: '1px solid #550000', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', color: '#ff5555' }}>
                    <AlertCircle size={20} /> {error}
                </div>
            )}

            {/* Blocked Source Warning (VPN Needed) */}
            {blockedSources.length > 0 && (
                <div style={{ maxWidth: '600px', margin: '0 auto 30px', textAlign: 'center', padding: '20px', background: '#2a1a1a', border: '1px solid #ff5252', borderRadius: '10px' }}>
                    <div style={{ color: '#ff5252', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '10px', fontWeight: 'bold', fontSize: '1.2rem' }}>
                        <Globe size={24} /> Connection Blocked
                    </div>
                    <p style={{ color: '#ddd', marginBottom: '10px', fontSize: '1.1rem' }}>
                        Your ISP has blocked <strong>{blockedSources.join(', ')}</strong>.
                    </p>
                    <p style={{ color: '#999', fontSize: '0.95rem' }}>
                        Please enable a <strong>VPN</strong> and try searching again.
                    </p>
                </div>
            )}

            {/* Results Grid */}
            <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {results.map((item, idx) => (
                    <div key={idx} style={{ background: '#111', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222', transition: 'transform 0.2s' }}>
                        <div style={{ padding: '20px' }}>
                            {/* Source Badge */}
                            <div style={{ marginBottom: '10px' }}>
                                <span style={{ ...getSourceBadgeStyle(item.source || source), padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    {item.source || source}
                                </span>
                            </div>

                            <h3 style={{ fontSize: '1rem', marginBottom: '10px', lineHeight: '1.4', height: '2.8em', overflow: 'hidden' }}>
                                {(item.title || '').replace(/Download|Tamil|Review|Online/g, '').trim()}
                            </h3>

                            {/* Torrent Info */}
                            {item.size && (
                                <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '10px', display: 'flex', gap: '15px' }}>
                                    <span>📦 {item.size}</span>
                                    {item.seeders !== undefined && <span style={{ color: '#4caf50' }}>🌱 {item.seeders}</span>}
                                    {item.leechers !== undefined && <span style={{ color: '#f44336' }}>⬇️ {item.leechers}</span>}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* Multi-Magnet Support for 1TamilMV */}
                                {item.magnets && item.magnets.length > 1 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {item.magnets.map((mag: any, mIdx: number) => (
                                            <a
                                                key={mIdx}
                                                href={mag.link}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '8px 12px', background: '#333',
                                                    border: '1px solid #444', borderRadius: '6px', color: '#fff',
                                                    textDecoration: 'none', fontSize: '0.85rem'
                                                }}
                                                title={mag.title}
                                            >
                                                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                                    🧲 {mag.title !== 'Unknown' && mag.title !== 'Standard' ? mag.title : `Link ${mIdx + 1}`}
                                                </span>
                                                {mag.size && mag.size !== 'Unknown' && (
                                                    <span style={{ background: '#4caf50', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                                                        {mag.size}
                                                    </span>
                                                )}
                                            </a>
                                        ))}
                                    </div>
                                ) : item.magnet ? (
                                    <a
                                        href={item.magnet}
                                        style={{
                                            padding: '12px', background: '#4caf50',
                                            textAlign: 'center', borderRadius: '8px', color: '#fff',
                                            textDecoration: 'none', fontWeight: 'bold', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}
                                    >
                                        <Download size={16} /> MAGNET {item.size ? `(${item.size})` : ''}
                                    </a>
                                ) : (item.source || source) === '1tamilmv' && item.link ? (
                                    <>
                                        {/* Fallback to simple magnet/watch if scrape failed to get deep magnets */}
                                        <Link
                                            href={`/watch/topic-${item.id || idx}?url=${encodeURIComponent(item.link)}&title=${encodeURIComponent(item.title)}`}
                                            style={{
                                                padding: '12px', background: '#ff5722',
                                                textAlign: 'center', borderRadius: '8px', color: '#fff',
                                                textDecoration: 'none', fontWeight: 'bold', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center', gap: '8px'
                                            }}
                                        >
                                            <Play size={16} /> WATCH
                                        </Link>
                                    </>
                                ) : item.link ? (
                                    <Link
                                        href={`/watch/topic-${item.id || idx}?url=${encodeURIComponent(item.link)}&title=${encodeURIComponent(item.title)}`}
                                        style={{
                                            padding: '12px', background: '#222',
                                            textAlign: 'center', borderRadius: '8px', color: '#fff',
                                            textDecoration: 'none', fontWeight: 'bold', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}
                                    >
                                        <Play size={16} /> WATCH
                                    </Link>
                                ) : (
                                    <span style={{ padding: '12px', background: '#333', textAlign: 'center', borderRadius: '8px', color: '#888' }}>
                                        No Link
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
