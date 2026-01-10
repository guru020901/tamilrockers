import React from 'react';
import styles from './MovieCard.module.css';
import Link from 'next/link';

interface Movie {
    id: string;
    title: string;
    poster: string;
    quality?: string;
}

interface MovieCardProps {
    movie: Movie;
}

const MovieCard: React.FC<MovieCardProps> = ({ movie }) => {
    return (
        <Link href={`/watch/${movie.id}`}>
            <div className={styles.card}>
                <img src={movie.poster} alt={movie.title} className={styles.image} loading="lazy" />
                <div className={styles.info}>
                    <h3 className={styles.title}>{movie.title}</h3>
                    <div className={styles.meta}>
                        <span className={styles.quality}>{movie.quality || 'HD'}</span>
                    </div>
                </div>
            </div>
        </Link>
    );
};

export default MovieCard;
