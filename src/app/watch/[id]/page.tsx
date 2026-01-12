'use client';

import React, { use, useState, useEffect } from 'react';
import VideoPlayer from '@/components/VideoPlayer';
import { ArrowLeft, Download, Shield } from 'lucide-react';
import Link from 'next/link';
import localMovies from '@/data/movies.json';
import { useSearchParams } from 'next/navigation';

export default function WatchPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const searchParams = useSearchParams();

    // Support both local JSON and dynamic connector data
    const [movie, setMovie] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            // Check Local JSON first
            const localMovie = localMovies.find((m) => m.id === id);
            if (localMovie) {
                setMovie(localMovie);
                setLoading(false);
                return;
            }

            // If ID starts with 'topic-', use Connector
            if (id.startsWith('topic-')) {
                const url = searchParams.get('url');
                const title = searchParams.get('title');

                if (url) {
                    try {
                        let apiUrl;
                        // Route based on domain
                        if (url.includes('1tamilblasters') || url.includes('tamilblasters')) {
                            apiUrl = `/api/tamilblasters/details?url=${encodeURIComponent(url)}`;
                        } else {
                            // Default to 1TamilMV (Serverless Route)
                            apiUrl = `/api/tamilmv/details?url=${encodeURIComponent(url)}`;
                        }

                        console.log(`Fetching details from: ${apiUrl}`);
                        const res = await fetch(apiUrl);
                        const data = await res.json();

                        if (data.success) {
                            // Handle both movie format and series format
                            const isSeriesFormat = data.data.isSeriesFormat && data.data.episodes;

                            setMovie({
                                id,
                                title: data.data.metadata?.seriesName || title || 'Unknown Title',
                                poster: data.data.poster,
                                // For series: flatten all episode magnets, for movies: use magnets array
                                magnets: isSeriesFormat
                                    ? data.data.episodes.flatMap((ep: any) => ep.torrents.map((t: any) => t.link))
                                    : data.data.magnets?.map((m: any) => m.link) || [],
                                watch: isSeriesFormat
                                    ? data.data.episodes[0]?.videoPreview
                                    : data.data.watch,
                                quality: 'HD Scraped',
                                imdb: data.data.imdbId || '',
                                // New fields for series
                                isSeriesFormat,
                                episodes: data.data.episodes,
                                metadata: data.data.metadata,
                                allTorrents: isSeriesFormat
                                    ? data.data.episodes.flatMap((ep: any) =>
                                        ep.torrents.map((t: any) => ({ ...t, episode: ep.number }))
                                    )
                                    : data.data.magnets
                            });
                        }
                    } catch (err) {
                        console.error("Connector Error:", err);
                    }
                }
            }
            setLoading(false);
        };
        fetchDetails();
    }, [id, searchParams]);

    // Dynamic browser tab title
    useEffect(() => {
        document.title = movie ? `${movie.title} - TorrentRockers` : 'TorrentRockers - Ultra-Fast Streaming';
    }, [movie]);

    if (loading) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff' }}>
                <h2>Loading TorrentRockers...</h2>
            </div>
        );
    }

    if (!movie) {
        return (
            <div style={{ padding: '50px', textAlign: 'center', background: '#000', color: '#fff', height: '100vh' }}>
                <h1>Movie Not Found</h1>
                <Link href="/" style={{ color: '#ff5722' }}>Go Home</Link>
            </div>
        );
    }

    return (
        <div style={{ background: '#000', minHeight: '100vh', color: '#fff', padding: '20px' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <Link href="/search" style={{ display: 'inline-flex', alignItems: 'center', color: '#aaa', textDecoration: 'none', marginBottom: '20px' }}>
                    <ArrowLeft size={20} style={{ marginRight: '8px' }} /> Back to Search
                </Link>

                <h1 style={{ fontSize: '2rem', marginBottom: '10px' }}>{movie.title}</h1>

                {/* Dynamic Quality Badge */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <span style={{ padding: '4px 12px', background: '#ff5722', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        {movie.quality || 'HD'}
                    </span>
                    {movie.watch && <span style={{ padding: '4px 12px', background: '#4CAF50', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>NATIVE STREAM</span>}
                </div>

                <div style={{ marginBottom: '30px' }}>
                    {/* Pass IMDB ID, MAGNET LIST, watch URL, TITLE and EPISODES for multi-episode support */}
                    <VideoPlayer
                        magnets={movie.magnets || []}
                        imdb={movie.imdb}
                        watch={movie.watch}
                        title={movie.title}
                        episodes={movie.episodes}
                    />
                </div>

                {/* Series Metadata (if available) */}
                {movie.metadata && (
                    <div style={{ background: '#1a1a2e', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                        {movie.metadata.director && (
                            <p style={{ margin: '5px 0', color: '#aaa' }}>
                                <strong style={{ color: '#fff' }}>Director:</strong> {movie.metadata.director}
                            </p>
                        )}
                        {movie.metadata.originalTitle && (
                            <p style={{ margin: '5px 0', color: '#aaa' }}>
                                <strong style={{ color: '#fff' }}>Original Title:</strong> {movie.metadata.originalTitle}
                            </p>
                        )}
                        {movie.metadata.plotSummary && (
                            <p style={{ margin: '10px 0', color: '#ccc', lineHeight: '1.6' }}>
                                {movie.metadata.plotSummary}
                            </p>
                        )}
                    </div>
                )}

                <div style={{ background: '#1f1f1f', padding: '20px', borderRadius: '8px' }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '15px' }}>
                        <Download size={20} style={{ verticalAlign: 'middle', marginRight: '10px' }} />
                        {movie.isSeriesFormat ? 'Episodes & Downloads' : 'Direct Download Links'}
                    </h2>

                    {/* Episode-aware torrent list */}
                    {movie.allTorrents && movie.allTorrents.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {movie.allTorrents.map((torrent: any, idx: number) => (
                                <div key={idx} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    background: '#2a2a2a', padding: '12px 15px', borderRadius: '6px',
                                    borderLeft: '4px solid #ff5722'
                                }}>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        {/* Episode Badge */}
                                        {torrent.episode && (
                                            <span style={{
                                                background: '#7c3aed', color: '#fff', padding: '2px 8px',
                                                borderRadius: '4px', fontSize: '0.75rem', marginRight: '8px'
                                            }}>
                                                EP {torrent.episode}
                                            </span>
                                        )}

                                        {/* Quality Badge */}
                                        <span style={{
                                            background: torrent.quality === '1080p' ? '#10b981' :
                                                torrent.quality === '720p' ? '#3b82f6' :
                                                    torrent.quality === '480p' ? '#f59e0b' : '#6b7280',
                                            color: '#fff', padding: '2px 8px', borderRadius: '4px',
                                            fontSize: '0.75rem', marginRight: '8px'
                                        }}>
                                            {torrent.quality}
                                        </span>

                                        {/* Size Badge */}
                                        {torrent.size && (
                                            <span style={{
                                                background: '#374151', color: '#9ca3af', padding: '2px 8px',
                                                borderRadius: '4px', fontSize: '0.75rem', marginRight: '10px'
                                            }}>
                                                {torrent.size}
                                            </span>
                                        )}

                                        {/* Filename */}
                                        <span style={{
                                            fontSize: '0.85rem', color: '#d1d5db',
                                            display: 'block', marginTop: '6px',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                        }}>
                                            {torrent.filename}
                                        </span>
                                    </div>

                                    <a
                                        href={torrent.link}
                                        style={{
                                            background: '#10b981', color: '#fff', padding: '8px 16px',
                                            borderRadius: '6px', fontWeight: 'bold', textDecoration: 'none',
                                            display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0
                                        }}
                                    >
                                        <Download size={16} /> GET
                                    </a>
                                </div>
                            ))}
                        </div>
                    ) : movie.magnets && movie.magnets.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {movie.magnets.map((magnet: string, idx: number) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: '#333', padding: '10px', borderRadius: '4px' }}>
                                    <span style={{ fontSize: '0.9rem', color: '#ccc', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '80%' }}>
                                        {magnet}
                                    </span>
                                    <a href={magnet} style={{ color: '#4CAF50', fontWeight: 'bold', textDecoration: 'none' }}>DOWNLOAD</a>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: '#888' }}>No download links available. Use Native Stream.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
