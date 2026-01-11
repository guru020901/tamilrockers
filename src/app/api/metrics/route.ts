import { NextResponse } from 'next/server';
import { searchCache, circuitBreaker } from '@/lib/cache';
import { performanceMonitor, prefetchManager } from '@/lib/advanced';

/**
 * Performance Monitoring Dashboard API
 * Real-time insights into system health and performance
 */
export async function GET() {
    return NextResponse.json({
        cache: {
            size: searchCache.size(),
            maxSize: 200,
            hitRate: 'Calculated client-side from logs'
        },
        circuitBreaker: {
            status: 'Active',
            // In production, export circuit breaker state here
        },
        performance: performanceMonitor.getAllStats(),
        popularQueries: prefetchManager.getPopularQueries(10),
        timestamp: new Date().toISOString(),
        uptime: process.uptime ? `${Math.floor(process.uptime() / 60)} minutes` : 'N/A'
    });
}
