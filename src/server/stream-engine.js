import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const torrentStream = require('torrent-stream');
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import cors from 'cors';
import rangeParser from 'range-parser';

// Initialize FFmpeg
// ffmpeg.setFfmpegPath(ffmpegPath); // Done purely in handler to capture correct closure

const app = express();
app.use(cors());

const PORT = 3005;

// Store active engines for monitoring
const activeEngines = new Map();

// List of stable public trackers to boost peer discovery
// Comprehensive list of trackers (UDP, WSS, HTTP) to force connectivity
const STABLE_TRACKERS = [
    'udp://bt1.archive.org:6969/announce',
    'udp://movies.zsw.ca:6969/announce',
    'udp://explodie.org:6969/announce',
    'udp://open.stealth.si:80/announce'
];

console.log(`
   _____ __                            _______ __            
  / ___// /_________  ____ _____ ___  /_  __(_) /_____ _____ 
  \\__ \\/ __/ ___/ _ \\/ __ \`/ __ \`__ \\  / / / / __/ __ \`/ __ \\
 ___/ / /_/ /  /  __/ /_/ / / / / / / / / / / /_/ /_/ / / / /
/____/\\__/_/   \\___/\\__,_/_/ /_/ /_/ /_/ /_/\\__/\\__,_/_/ /_/ 
                                                             
🚀 Enterprise Streaming Engine v2.1 (Live Stats)
`);

app.get('/health', (req, res) => {
    const magnet = req.query.magnet;
    if (!magnet) return res.json({ error: 'No magnet' });

    const infoHashMatch = magnet.match(/xt=urn:btih:([a-zA-Z0-9]*)/);
    const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : 'unknown';

    if (activeEngines.has(infoHash)) {
        const engine = activeEngines.get(infoHash);
        if (engine && engine.torrent && engine.torrent.files && engine.torrent.files.length > 0) {
            // Find the main file being streamed
            const file = engine.torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi')) || engine.torrent.files[0];

            return res.json({
                peers: engine.swarm.wires.length,
                downloadSpeed: engine.swarm.downloadSpeed(),
                filename: file ? file.name : 'unknown',
                type: file ? file.name.split('.').pop() : 'unknown'
            });
        } else {
            return res.json({ peers: 0, downloadSpeed: 0, filename: null, type: null });
        }
    }

    res.json({ status: 'idle', peers: 0 });
});

app.get('/stream', (req, res) => {
    let magnet = req.query.magnet;
    if (!magnet) return res.status(400).send('Magnet link required');

    // Auto-inject high-speed trackers
    const trackerParams = STABLE_TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    if (!magnet.includes('tr=')) {
        magnet += trackerParams;
    }

    const infoHashMatch = magnet.match(/xt=urn:btih:([a-zA-Z0-9]*)/);
    const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : 'unknown';

    console.log(`[StreamTitan] Request received for: ${infoHash}...`);

    // Check if duplicate engine exists? torrent-stream usually handles its own, but we want to track it.
    // Ideally we reuse engines but for simplicity in v2.1 we create new to ensure fresh connections.

    const engine = torrentStream(magnet, {
        tmp: './tmp',
        verify: false,
        connections: 100,
        uploads: 10
    });

    activeEngines.set(infoHash, engine);

    engine.on('ready', () => {
        console.log(`[StreamTitan] Metadata ready. Files: ${engine.files.length}`);

        const file = engine.files.find(f =>
            f.name.endsWith('.mp4') ||
            f.name.endsWith('.mkv') ||
            f.name.endsWith('.avi')
        ) || engine.files.sort((a, b) => b.length - a.length)[0];

        if (!file) {
            engine.destroy(() => { });
            activeEngines.delete(infoHash);
            return res.status(404).send('No video file found');
        }

        console.log(`[StreamTitan] Streaming: ${file.name} (${(file.length / 1024 / 1024).toFixed(2)} MB)`);
        file.select();

        // 3. Create a stream for the file
        // 4. SMART TRANSCODING (Advanced Tech)
        if (file.name.endsWith('.mkv') || file.name.endsWith('.avi') || !file.name.endsWith('.mp4')) {
            console.log(`[StreamTitan] ⚠️ Incompatible Format Detected: ${file.name}`);
            console.log(`[StreamTitan] ☢️  Engaging Quantum Transcoder (libx264/ultrafast)...`);

            // Ensure FFmpeg path is set correctly
            const ffmpegBinary = ffmpegPath; // Already imported at top level
            ffmpeg.setFfmpegPath(ffmpegBinary);

            const stream = file.createReadStream();

            res.writeHead(200, {
                'Content-Type': 'video/mp4',
                'Transfer-Encoding': 'chunked',
                'Access-Control-Allow-Origin': '*'
            });

            const command = ffmpeg(stream)
                .format('mp4')
                .outputOptions([
                    '-movflags frag_keyframe+empty_moov+default_base_moof', // Advanced fragmentation
                    '-vcodec libx264',
                    '-preset ultrafast',
                    '-tune zerolatency',
                    '-vf scale=-2:720', // Downscale for performance
                    '-crf 28',
                    '-acodec aac',
                    '-ac 2',
                    '-strict experimental'
                ]);

            command.on('start', (cmdLine) => {
                console.log(`[StreamTitan] Transcoder Started: ${cmdLine}`);
            });

            command.on('progress', (progress) => {
                // Log progress occasionally
                if (progress.timemark) process.stdout.write(`[StreamTitan] Encoding: ${progress.timemark} @ ${progress.currentFps}fps \r`);
            });

            command.on('error', (err) => {
                // Suppress expected "Output stream closed" error when client disconnects
                if (err.message !== 'Output stream closed') {
                    console.error('\n[StreamTitan] Transcoding Error:', err.message);
                    if (!res.headersSent) res.status(500).end();
                }
            });

            // Pipe output to response
            command.pipe(res, { end: true });
            return;
        }

        // Standard MP4 Streaming (Direct)
        const range = req.headers.range;
        if (range) {
            const parts = rangeParser(file.length, range)[0];
            const start = parts.start;
            const end = parts.end;
            const chunksize = (end - start) + 1;

            const stream = file.createReadStream({ start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${file.length}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
                'Access-Control-Allow-Origin': '*',
            });
            stream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': file.length,
                'Content-Type': 'video/mp4',
                'Access-Control-Allow-Origin': '*',
            });
            file.createReadStream().pipe(res);
        }
    });

    req.on('close', () => {
        console.log('[StreamTitan] Client disconnected.');
        engine.destroy(() => { });
        activeEngines.delete(infoHash);
    });
});

app.listen(PORT, () => {
    console.log(`[StreamTitan] Listening on port ${PORT}`);
});
