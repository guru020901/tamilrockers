@echo off
echo Starting TorrentRockers Services...

:: 1. Start 1TamilMV Connector (Port 3007)
start "1TamilMV Connector (3007)" cmd /k "node src/server/connector.js"

:: 2. Start Torrent Search Service (Port 3008)
start "Torrent Search Service (3008)" cmd /k "node src/server/torrent-search.js"

:: 3. Start Next.js Frontend (Port 3000)
echo Starting Frontend...
npm run dev
