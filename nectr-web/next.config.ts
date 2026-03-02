import type { NextConfig } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error(
    'Missing required environment variable: NEXT_PUBLIC_API_URL\n' +
    'Copy .env.example to .env.local and set the value before building.'
  );
}

const nextConfig: NextConfig = {
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
