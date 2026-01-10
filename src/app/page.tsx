import React from 'react';
import MovieCard from '@/components/MovieCard';
import HeroSection from '@/components/HeroSection';
import { headers } from 'next/headers';

async function getMovies() {
  // In a real app with external API, we would fetch(API_URL).
  // Here we can import directly or fetch our own API.
  // Since we are Server Component, we can import data directly if we want,
  // but let's simulate fetch to be "architecturally correct" for the API route plan.
  // However, fetching localhost in build time or without absolute URL can be tricky.
  // So we will import the logic or data directly for stability in this demo.
  // We'll trust the plan and use the API route via absolute URL or just import data.
  // Reverting to direct import to avoid "localhost" port guessing/fetch errors in dev.
  const movies = (await import('@/data/movies.json')).default;
  return movies;
}

export default async function Home() {
  const movies = await getMovies();
  const heroMovie = movies[0];

  return (
    <main style={{ paddingBottom: '50px' }}>
      {heroMovie && <HeroSection movie={heroMovie} />}

      <section style={{ padding: '20px 4%' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '20px', color: '#e5e5e5' }}>
          Latest Releases
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '20px'
        }}>
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      </section>
    </main>
  );
}
