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
                            setMovie({
                                id,
                                title: title || 'Unknown Title',
                                poster: data.data.poster,
                                magnets: data.data.magnets.map((m: any) => m.link),
                                watch: data.data.watch,
                                quality: 'HD Scraped',
                                imdb: data.data.imdbId || ''
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
                    {/* Pass IMDB ID, MAGNET LIST, watch URL and TITLE for auto IMDB lookup */}
                    <VideoPlayer magnets={movie.magnets || []} imdb={movie.imdb} watch={movie.watch} title={movie.title} />
                </div>

                <div style={{ background: '#1f1f1f', padding: '20px', borderRadius: '8px' }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '15px' }}>
                        <Download size={20} style={{ verticalAlign: 'middle', marginRight: '10px' }} />
                        Direct Download Links (P2P)
                    </h2>

                    {movie.magnets && movie.magnets.length > 0 ? (
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
                        <div style={{ color: '#888' }}>No P2P links available for this title. Use Native Stream.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
