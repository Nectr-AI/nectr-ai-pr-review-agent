import type { NextConfig } from 'next';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://devkit-production.up.railway.app';

const nextConfig: NextConfig = {
  // react-force-graph-2d and its three.js / d3 deps are ESM-only packages;
  // Next.js must transpile them or the production bundle crashes at runtime.
  transpilePackages: ['react-force-graph-2d', 'three', 'three-spritetext'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'github.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/auth/:path*',
        destination: `${API_URL}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
