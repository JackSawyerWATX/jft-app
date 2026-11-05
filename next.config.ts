import type { NextConfig } from 'next';

const config: NextConfig = {
  // Quick Tunnel hostnames change on each run; permit their development assets.
  allowedDevOrigins: ['*.trycloudflare.com'],
  // Bearer URLs must never enter development access logs or browser log forwarding.
  logging: false,
  turbopack: {
    root: import.meta.dirname
  },
  async headers() {
    return ['/s/:path*', '/api/public/shares/:path*'].map((source) => ({
      source,
      headers: [
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Referrer-Policy', value: 'no-referrer' }
      ]
    }));
  }
};
export default config;
