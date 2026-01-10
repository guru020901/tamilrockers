// @ts-nocheck
import WebTorrent from 'webtorrent';

// Singleton pattern to prevent creating multiple clients on hot reloads in dev
const globalForTorrent = global as unknown as { torrentClient: WebTorrent.Instance };

export const torrentClient =
    globalForTorrent.torrentClient ||
    new WebTorrent({
        // Disable uTP to avoid native build issues on Windows environments without build tools
        // This forces TCP/WebRTC only, which is still very good (standard TCP is the main protocol)
        utp: false,
        // Limit upload speed to avoid choking the connection (optional)
        // uploadLimit: 1024 * 1024, 
    });

if (process.env.NODE_ENV !== 'production') globalForTorrent.torrentClient = torrentClient;

export default torrentClient;
