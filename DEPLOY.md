# Deployment Guide for TorrentRockers

Your application consists of three distinct services that need to run simultaneously:
1.  **Frontend (Next.js)**: The user interface (Port 3000).
2.  **Connector Service**: Scrapes 1TamilMV using Puppeteer (Port 3007).
3.  **Torrent Search Service**: Scrapes TPB/1337x using Puppeteer (Port 3008).

Because of the **Puppeteer** dependency (which requires a real Chrome browser installed in the environment), you cannot use standard "Serverless" hosting like Vercel for the backend parts.

**Recommended Solution: Docker**
We will package the entire application (Frontend + Backends + Chrome) into a single Docker container. This allows you to deploy it easily on platforms like **Railway**, **Render**, or any **VPS**.

## 1. Prerequisites
- GitHub Account (to push your code).
- Account on a hosting provider (Railway.app (Recommended), Render.com, or a VPS like DigitalOcean).

## 2. Configuration Files
I have created the following files in your project root:
- `Dockerfile`: Installs Node.js, Chromium, and builds your app.
- `supervisord.conf`: Manages running all 3 services at once inside the container.

## 3. Deploying WITHOUT GitHub (Direct Upload)
The easiest way to deploy without GitHub is using the **Railway CLI**.

1.  **Install Railway CLI**:
    - **Windows**: `npm install -g @railway/cli`
    - **Mac/Linux**: `curl -fsSL https://railway.app/install.sh | sh`

2.  **Login**:
    Run this command in your terminal:
    ```bash
    railway login
    ```
    (It will open your browser to authenticate).

3.  **Initialize Project**:
    Run inside your project folder:
    ```bash
    railway init
    ```
    - Select "New Project" -> "Empty Project".

4.  **Deploy**:
    Run:
    ```bash
    railway up
    ```
    - This will zip your local code, upload it to Railway, and build it using the `Dockerfile`.
    - Once done, it will give you a public URL.

## 4. Deploying to a VPS (Manual Upload)
If you have a VPS (Ubuntu server) and don't want to use git:

1.  **Zip your project** (excluding `node_modules`).
2.  **Upload to server** (using WinSCP or SCP):
    ```bash
    scp -r tamilrockers.zip root@your-server-ip:/root/
    ```
3.  **SSH into server**:
    ```bash
    unzip tamilrockers.zip
    cd tamilrockers
    docker build -t app .
    docker run -d -p 80:3000 --restart always app
    ```

**IMPORTANT: Client-Side Fetching Fix**
Currently, your `page.tsx` calls `http://localhost:3007` from the *browser*. This **will not work** when deployed because `localhost` refers to the user's computer, not the server.

**Action Required**:
I have updated the code to use **Server Actions** or a Next.js API Route proxy, so the browser calls `/api/proxy/...` which then calls `localhost:3007`.

*Wait, I need to check if I did this.*
(Self-correction: I haven't done this yet. The current setup calls `http://localhost:3007` directly from `page.tsx`. This MUST be fixed for deployment.)
