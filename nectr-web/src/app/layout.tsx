import type { Metadata, Viewport } from 'next';
import { DM_Sans, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://nectr.dev'),
  title: {
    default: 'Nectr — AI-Powered Developer Productivity for Engineering Teams',
    template: '%s | Nectr',
  },
  description:
    'Nectr monitors your team\'s GitHub workflow, reviews pull requests with AI, detects friction, and auto-fixes the obvious stuff — so your engineers ship faster.',
  keywords: [
    'AI code review',
    'developer productivity',
    'GitHub automation',
    'PR review automation',
    'engineering team analytics',
    'code quality',
    'developer workflow',
    'CI/CD automation',
    'team insights',
    'software engineering tools',
  ],
  authors: [{ name: 'Dhanush Chalicheemala', url: 'https://x.com/dhanush_chali' }],
  creator: 'Dhanush Chalicheemala',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://nectr.dev',
    siteName: 'Nectr',
    title: 'Nectr — AI-Powered Developer Productivity',
    description:
      'AI code review, team analytics, and workflow intelligence for engineering teams. Connect GitHub, get insights in minutes.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Nectr — AI Developer Productivity',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@dhanush_chali',
    creator: '@dhanush_chali',
    title: 'Nectr — AI Developer Productivity',
    description: 'AI code review and workflow intelligence for engineering teams.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
  icons: {
    icon: [
      { url: '/assets/nectr-icon-16.svg', sizes: '16x16', type: 'image/svg+xml' },
      { url: '/assets/nectr-icon-32.svg', sizes: '32x32', type: 'image/svg+xml' },
    ],
    apple: '/assets/nectr-icon-72.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#111111',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${geistMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Nectr',
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Web',
              description:
                'AI-powered code review and developer productivity platform for engineering teams.',
              url: 'https://nectr.dev',
              author: {
                '@type': 'Person',
                name: 'Dhanush Chalicheemala',
                url: 'https://x.com/dhanush_chali',
              },
              offers: {
                '@type': 'AggregateOffer',
                priceCurrency: 'USD',
                lowPrice: '0',
                offerCount: '2',
              },
            }),
          }}
        />
      </head>
      <body className="font-sans antialiased bg-surface text-content-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
