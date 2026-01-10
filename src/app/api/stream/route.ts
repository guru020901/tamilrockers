import { NextRequest, NextResponse } from 'next/server';
import torrentClient from '@/lib/torrent-client';
import { Readable } from 'stream';

function iteratorToStream(iterator: any) {
    return new ReadableStream({
        async pull(controller) {
            const { value, done } = await iterator.next();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value);
            }
        },
    });
}

export async function GET(request: NextRequest) {
    console.log('[API] Stream Request Received');
    const searchParams = request.nextUrl.searchParams;
    const magnet = searchParams.get('magnet');

    if (!magnet) {
        console.error('[API] Missing magnet link');
        return new NextResponse('Missing magnet link', { status: 400 });
    }

    // Check if torrent already exists
    let torrent = torrentClient.get(magnet);

    if (!torrent) {
        console.log('[API] Adding new torrent...');
        // Add torrent if not exists
        await new Promise<void>((resolve) => {
            /* @ts-ignore */
            torrentClient.add(magnet, (t) => {
                console.log('[API] Torrent metadata received:', t.infoHash);
                torrent = t;
                resolve();
            });
            // longer timeout for initial metadata
            setTimeout(() => {
                console.warn('[API] Metadata fetch timeout (15s)');
                resolve();
            }, 15000);
        });
    } else {
        console.log('[API] Torrent already active:', torrent.infoHash);
    }

    // Re-fetch in case it was added by the callback
    torrent = torrentClient.get(magnet);

    if (!torrent || !torrent.files || torrent.files.length === 0) {
        console.error('[API] Torrent missing or no files found');
        if (torrent) {
            return new NextResponse('Metadata gathering. Please refresh in a few seconds.', { status: 503 });
        }
        return new NextResponse('Failed to add torrent', { status: 500 });
    }

    // Find the largest file (video)
    const file = torrent.files.reduce((a, b) => (a.length > b.length ? a : b));
    console.log('[API] Streaming file:', file.name);

    // Parse Range Header
    const range = request.headers.get('range');

    if (!range) {
        const nodeStream = file.createReadStream();
        // @ts-ignore
        const stream = iteratorToStream(nodeStream[Symbol.asyncIterator]());

        return new NextResponse(stream, {
            headers: {
                'Content-Length': file.length.toString(),
                'Content-Type': 'video/mp4',
            },
        });
    }

    // Handle Range Request
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
    const chunksize = end - start + 1;

    const nodeStream = file.createReadStream({ start, end });
    // @ts-ignore
    const stream = iteratorToStream(nodeStream[Symbol.asyncIterator]());

    return new NextResponse(stream, {
        status: 206,
        headers: {
            'Content-Range': `bytes ${start}-${end}/${file.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': 'video/mp4',
        },
    });
}
