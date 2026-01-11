'use client';

import React, { useState, useEffect } from 'react';
import { Search, Play, Loader, AlertCircle, Database, Globe, Zap, Download, Settings } from 'lucide-react';
import Link from 'next/link';

type SearchSource = '1tamilmv' | 'tpb' | '1337x' | 'rutracker' | '1tamilblasters' | 'all';

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
        'rutracker': 'rutracker.org',
        '1tamilblasters': 'https://1tamilblasters.business'
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

        // Helper to fetch and append results
        const fetchSource = async (url: string, sourceName: string) => {
            try {
                const res = await fetch(url);
                const data = await res.json();

                // Check if blocked
                if (data.status && Object.values(data.status).includes('blocked')) {
                    setBlockedSources(prev => [...prev, sourceName]);
                }

                if (data.results && data.results.length > 0) {
                    setResults(prev => {
                        const existing = new Set(prev.map(p => p.link));
                        const newItems = data.results.filter((i: any) => !existing.has(i.link)).map((r: any) => ({ ...r, source: r.source || sourceName }));
                        return [...prev, ...newItems]; // Stream in results
                    });
                }
            } catch (err) {
                console.error(`${sourceName} Search Error:`, err);
                // Don't set global error, just log it. Partial results are better than none.
            }
        };

        const promises = [];
        const tpbParam = encodeURIComponent(domains['tpb']);
        const x1337Param = encodeURIComponent(domains['1337x']);
        const ruParam = encodeURIComponent(domains['rutracker']);
        const mvParam = encodeURIComponent(domains['1tamilmv']);
        const q = encodeURIComponent(query);

        if (source === 'all') {
            // FIRE EVERYTHING (Distributed Parallel Execution)
            promises.push(fetchSource(`/api/tamilmv?q=${q}&domain=${mvParam}`, '1tamilmv'));
            promises.push(fetchSource(`/api/tamilblasters?q=${q}`, '1tamilblasters'));

            // Split torrent sources to avoid monolithic timeout
            promises.push(fetchSource(`/api/torrents?q=${q}&source=tpb&tpbDomain=${tpbParam}`, 'tpb'));
            promises.push(fetchSource(`/api/torrents?q=${q}&source=1337x&x1337Domain=${x1337Param}`, '1337x'));
            promises.push(fetchSource(`/api/torrents?q=${q}&source=rutracker&ruDomain=${ruParam}`, 'rutracker'));

        } else if (source === '1tamilmv') {
            promises.push(fetchSource(`/api/tamilmv?q=${q}&domain=${mvParam}`, '1tamilmv'));
        } else if (source === '1tamilblasters') {
            promises.push(fetchSource(`/api/tamilblasters?q=${q}`, '1tamilblasters'));
        } else if (source === 'tpb') {
            promises.push(fetchSource(`/api/torrents?q=${q}&source=tpb&tpbDomain=${tpbParam}`, 'tpb'));
        } else if (source === '1337x') {
            promises.push(fetchSource(`/api/torrents?q=${q}&source=1337x&x1337Domain=${x1337Param}`, '1337x'));
        } else if (source === 'rutracker') {
            promises.push(fetchSource(`/api/torrents?q=${q}&source=rutracker&ruDomain=${ruParam}`, 'rutracker'));
        }

        try {
            await Promise.allSettled(promises);
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
            case '1tamilblasters': return { background: '#ff9800', color: '#fff' };
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
                <p style={{ color: '#888' }}>Multi-Source Torrent Search • TPB • 1337x • 1TamilMV • 1TamilBlasters</p>
            </div>

            {/* Source Selector */}
            <div style={{ maxWidth: '700px', margin: '0 auto 20px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {[
                    { id: 'tpb', name: 'ThePirateBay', icon: <Globe size={16} /> },
                    { id: '1337x', name: '1337x', icon: <Zap size={16} /> },
                    { id: 'rutracker', name: 'RuTracker', icon: <Database size={16} /> },
                    { id: '1tamilmv', name: '1TamilMV', icon: <Database size={16} /> },
                    { id: '1tamilblasters', name: '1TamilBlasters', icon: <Zap size={16} /> },
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

                            {/* Title Link */}
                            {/* Title Link */}
                            <h3 style={{ fontSize: '1rem', marginBottom: '10px', lineHeight: '1.4', height: '2.8em', overflow: 'hidden' }}>
                                {(item.magnet || (item.magnets && item.magnets[0])) ? (
                                    <a
                                        href={item.magnet || item.magnets[0].link}
                                        style={{ color: '#fff', textDecoration: 'none', cursor: 'pointer' }}
                                    >
                                        {(item.title || '').replace(/Download|Tamil|Review|Online/g, '').trim()}
                                    </a>
                                ) : (item.source === '1tamilmv' || item.source === '1tamilblasters' || item.link?.includes('topic')) ? (
                                    <Link
                                        href={`/watch/topic-${item.id}?url=${encodeURIComponent(item.link)}&title=${encodeURIComponent(item.title)}`}
                                        style={{ color: '#fff', textDecoration: 'none', cursor: 'pointer' }}
                                    >
                                        {(item.title || '').replace(/Download|Tamil|Review|Online/g, '').trim()}
                                    </Link>
                                ) : (
                                    <span>{(item.title || '').replace(/Download|Tamil|Review|Online/g, '').trim()}</span>
                                )}
                            </h3>

                            {/* Torrent Info */}
                            {item.size && (
                                <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '10px', display: 'flex', gap: '15px' }}>
                                    <span>📦 {item.size}</span>
                                    {item.seeders !== undefined && <span style={{ color: '#4caf50' }}>🌱 {item.seeders}</span>}
                                    {item.leechers !== undefined && <span style={{ color: '#f44336' }}>⬇️ {item.leechers}</span>}
                                </div>
                            )}

                            {/* Removed Action Buttons as per request */}
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
