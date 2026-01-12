'use client';

import React, { useState, useEffect } from 'react';
import { Search, Play, Loader, AlertCircle, Database, Globe, Zap, Download, Settings, X, ArrowUpDown, Users, HardDrive, Calendar } from 'lucide-react';
import Link from 'next/link';

type SearchSource = '1tamilmv' | 'tpb' | '1337x' | 'rutracker' | '1tamilblasters' | 'all';
type SortOption = 'relevance' | 'seeders' | 'size' | 'date';

// 🎭 SKELETON LOADER COMPONENT
const SkeletonCard = () => (
    <div style={{ background: '#111', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222', padding: '20px' }}>
        <div style={{ width: '60px', height: '20px', background: '#222', borderRadius: '4px', marginBottom: '15px', animation: 'pulse 1.5s infinite' }} />
        <div style={{ width: '100%', height: '20px', background: '#222', borderRadius: '4px', marginBottom: '10px', animation: 'pulse 1.5s infinite' }} />
        <div style={{ width: '70%', height: '20px', background: '#222', borderRadius: '4px', marginBottom: '15px', animation: 'pulse 1.5s infinite' }} />
        <div style={{ display: 'flex', gap: '15px' }}>
            <div style={{ width: '60px', height: '16px', background: '#222', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '40px', height: '16px', background: '#222', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
        </div>
    </div>
);

export default function SearchPage() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [source, setSource] = useState<SearchSource>('all');
    const [blockedSources, setBlockedSources] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState<SortOption>('relevance');
    const [hasSearched, setHasSearched] = useState(false);

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

    // 🔄 SORTING LOGIC
    const sortedResults = React.useMemo(() => {
        const sorted = [...results];
        switch (sortBy) {
            case 'seeders':
                return sorted.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
            case 'size':
                // Parse size strings like "1.5 GB", "500 MB" etc.
                const parseSize = (s: string) => {
                    if (!s) return 0;
                    const match = s.match(/([\d.]+)\s*(GB|MB|KB|TB)/i);
                    if (!match) return 0;
                    const num = parseFloat(match[1]);
                    const unit = match[2].toUpperCase();
                    const multipliers: Record<string, number> = { KB: 1, MB: 1024, GB: 1024 * 1024, TB: 1024 * 1024 * 1024 };
                    return num * (multipliers[unit] || 1);
                };
                return sorted.sort((a, b) => parseSize(b.size || '') - parseSize(a.size || ''));
            case 'date':
                return sorted.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            default:
                return sorted;
        }
    }, [results, sortBy]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError(null);
        setResults([]);
        setBlockedSources([]);
        setHasSearched(true);

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
            }
        };

        const promises = [];
        const tpbParam = encodeURIComponent(domains['tpb']);
        const x1337Param = encodeURIComponent(domains['1337x']);
        const ruParam = encodeURIComponent(domains['rutracker']);
        const mvParam = encodeURIComponent(domains['1tamilmv']);
        const q = encodeURIComponent(query);

        if (source === 'all') {
            promises.push(fetchSource(`/api/tamilmv?q=${q}&domain=${mvParam}`, '1tamilmv'));
            promises.push(fetchSource(`/api/tamilblasters?q=${q}`, '1tamilblasters'));
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

    const clearSearch = () => {
        setQuery('');
        setResults([]);
        setHasSearched(false);
    };

    return (
        <div style={{ minHeight: '100vh', background: '#000', color: '#fff', padding: '40px 20px' }}>
            {/* Header */}
            <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', marginBottom: '30px' }}>
                <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 'bold', marginBottom: '10px', background: 'linear-gradient(45deg, #ff5722, #ff9100)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    TorrentRockers
                </h1>
                <p style={{ color: '#888', fontSize: 'clamp(0.8rem, 2vw, 1rem)' }}>Multi-Source Torrent Search • TPB • 1337x • 1TamilMV • 1TamilBlasters</p>
            </div>

            {/* 📱 MOBILE-OPTIMIZED SOURCE SELECTOR */}
            <div style={{
                maxWidth: '700px',
                margin: '0 auto 20px',
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-start',
                overflowX: 'auto',
                paddingBottom: '10px',
                WebkitOverflowScrolling: 'touch'
            }}>
                {[
                    { id: 'tpb', name: 'TPB', icon: <Globe size={14} /> },
                    { id: '1337x', name: '1337x', icon: <Zap size={14} /> },
                    { id: 'rutracker', name: 'RuTracker', icon: <Database size={14} /> },
                    { id: '1tamilmv', name: '1TamilMV', icon: <Database size={14} /> },
                    { id: '1tamilblasters', name: '1TB', icon: <Zap size={14} /> },
                    { id: 'all', name: 'All', icon: <Search size={14} /> },
                ].map((s) => (
                    <button
                        key={s.id}
                        onClick={() => setSource(s.id as SearchSource)}
                        style={{
                            padding: '12px 20px',
                            background: source === s.id ? 'linear-gradient(135deg, #ff5722, #ff9100)' : '#1a1a1a',
                            border: source === s.id ? 'none' : '1px solid #333',
                            borderRadius: '25px',
                            color: '#fff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: source === s.id ? 'bold' : 'normal',
                            transition: 'all 0.3s',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            boxShadow: source === s.id ? '0 4px 15px rgba(255,87,34,0.4)' : 'none',
                            transform: source === s.id ? 'scale(1.05)' : 'scale(1)'
                        }}
                    >
                        {s.icon} {s.name}
                    </button>
                ))}
            </div>

            {/* 🔍 ENHANCED SEARCH BAR WITH CLEAR BUTTON */}
            <form onSubmit={handleSearch} style={{ maxWidth: '600px', margin: '0 auto 30px', position: 'relative' }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search movies, series, games..."
                    suppressHydrationWarning
                    style={{
                        width: '100%', padding: '18px 100px 18px 25px',
                        fontSize: '1.1rem', background: '#111', border: '2px solid #333',
                        borderRadius: '50px', color: '#fff', outline: 'none',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                        transition: 'border-color 0.3s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#ff5722'}
                    onBlur={(e) => e.target.style.borderColor = '#333'}
                />
                {/* ❌ CLEAR BUTTON */}
                {query && (
                    <button
                        type="button"
                        onClick={clearSearch}
                        style={{
                            position: 'absolute', right: '70px', top: '50%', transform: 'translateY(-50%)',
                            width: '30px', height: '30px', borderRadius: '50%',
                            background: '#333', border: 'none', color: '#888',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <X size={16} />
                    </button>
                )}
                <button
                    type="submit"
                    suppressHydrationWarning
                    style={{
                        position: 'absolute', right: '8px', top: '8px',
                        width: '50px', height: '50px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #ff5722, #ff9100)', border: 'none', color: '#fff',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 15px rgba(255,87,34,0.4)'
                    }}
                >
                    {loading ? <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={24} />}
                </button>
            </form>

            {/* 🔄 SORTING OPTIONS (Only show when results exist) */}
            {results.length > 0 && (
                <div style={{
                    maxWidth: '600px',
                    margin: '0 auto 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#111',
                    padding: '10px 15px',
                    borderRadius: '10px',
                    flexWrap: 'wrap'
                }}>
                    <span style={{ color: '#888', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <ArrowUpDown size={14} /> Sort:
                    </span>
                    {[
                        { id: 'relevance', name: 'Relevance', icon: null },
                        { id: 'seeders', name: 'Seeders', icon: <Users size={12} /> },
                        { id: 'size', name: 'Size', icon: <HardDrive size={12} /> },
                    ].map((s) => (
                        <button
                            key={s.id}
                            onClick={() => setSortBy(s.id as SortOption)}
                            style={{
                                padding: '6px 12px',
                                background: sortBy === s.id ? '#ff5722' : '#222',
                                border: 'none', borderRadius: '15px',
                                color: '#fff', cursor: 'pointer', fontSize: '0.8rem',
                                display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            {s.icon} {s.name}
                        </button>
                    ))}
                    <span style={{ marginLeft: 'auto', color: '#888', fontSize: '0.8rem' }}>
                        {results.length} results
                    </span>
                </div>
            )}

            {/* Error Message */}
            {error && !loading && results.length === 0 && blockedSources.length === 0 && (
                <div style={{ maxWidth: '600px', margin: '0 auto 30px', padding: '20px', background: '#220000', border: '1px solid #550000', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', color: '#ff5555' }}>
                    <AlertCircle size={20} /> {error}
                </div>
            )}

            {/* Blocked Source Warning */}
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

            {/* 🎭 SKELETON LOADERS (During Loading) */}
            {loading && results.length === 0 && (
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
                </div>
            )}

            {/* 📭 EMPTY STATE */}
            {hasSearched && !loading && results.length === 0 && blockedSources.length === 0 && (
                <div style={{ maxWidth: '400px', margin: '60px auto', textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🔍</div>
                    <h3 style={{ color: '#888', marginBottom: '10px' }}>No results found</h3>
                    <p style={{ color: '#555', fontSize: '0.9rem' }}>Try a different search term or source</p>
                </div>
            )}

            {/* Results Grid */}
            <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {sortedResults.map((item, idx) => (
                    <div
                        key={idx}
                        style={{
                            background: '#111',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            border: '1px solid #222',
                            transition: 'all 0.3s',
                            cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-5px)';
                            e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
                            e.currentTarget.style.borderColor = '#ff5722';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.borderColor = '#222';
                        }}
                    >
                        <div style={{ padding: '20px' }}>
                            {/* Source Badge */}
                            <div style={{ marginBottom: '10px' }}>
                                <span style={{ ...getSourceBadgeStyle(item.source || source), padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    {item.source || source}
                                </span>
                            </div>

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
                                <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '10px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                                    <span>📦 {item.size}</span>
                                    {item.seeders !== undefined && <span style={{ color: '#4caf50' }}>🌱 {item.seeders}</span>}
                                    {item.leechers !== undefined && <span style={{ color: '#f44336' }}>⬇️ {item.leechers}</span>}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
                ::-webkit-scrollbar { height: 6px; }
                ::-webkit-scrollbar-track { background: #111; }
                ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
            `}</style>
        </div>
    );
}

