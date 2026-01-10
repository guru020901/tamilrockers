import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['webtorrent', 'node-datachannel', 'puppeteer', 'puppeteer-core', 'fluent-ffmpeg'],
};

export default nextConfig;
