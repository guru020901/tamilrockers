import React from 'react';
import styles from './HeroSection.module.css';
import { Play, Info } from 'lucide-react';
import Link from 'next/link';

interface Movie {
    id: string;
    title: string;
    poster: string;
    quality?: string;
}

interface HeroSectionProps {
    movie: Movie;
}

const HeroSection: React.FC<HeroSectionProps> = ({ movie }) => {
    return (
        <div
            className={styles.hero}
            style={{ backgroundImage: `url(${movie.poster})` }}
        >
            <div className={styles.overlay} />
            <div className={styles.content}>
                <h1 className={styles.title}>{movie.title}</h1>
                <p className={styles.description}>
                    Watch the latest blockbuster now. High quality streaming available.
                </p>
                <div className={styles.buttons}>
                    <Link href={`/watch/${movie.id}`}>
                        <button className={`${styles.button} ${styles.playButton}`}>
                            <Play fill="black" size={24} /> Play
                        </button>
                    </Link>
                    <button className={`${styles.button} ${styles.infoButton}`}>
                        <Info size={24} /> More Info
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HeroSection;
