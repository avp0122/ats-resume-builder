import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import RouteProgress from '@/components/RouteProgress';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';

const SITE_URL = 'https://kairesume.fit';
const SITE_NAME = 'kairesume';
const SITE_TAGLINE = 'The cheapest AI resume builder — free ATS-tailored resumes & cover letters';
const SITE_DESCRIPTION =
  'kairesume is the cheapest AI resume builder. Generate free, AI-tailored, ATS-optimized resumes and cover letters with an instant match score. Score higher, land more interviews — best-match keywords highlighted, unlimited Pro for $4.99/month.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'free AI resume builder',
    'cheapest AI resume builder',
    'AI resume generator',
    'ATS resume',
    'ATS-optimized resume',
    'tailored resume',
    'AI cover letter generator',
    'tailored cover letter',
    'interview best match',
    'resume keyword match',
    'high scorer resume',
    'resume ATS score',
    'beat the ATS',
    'job application AI',
    'resume builder online free',
    'AI job application',
    'crypto resume builder',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: SITE_URL },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  category: 'productivity',
};

const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Any',
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free AI-tailored ATS resume and cover letter generation.',
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '4.99',
      priceCurrency: 'USD',
      description: 'Unlimited generations — the cheapest AI resume builder.',
    },
  ],
  featureList: [
    'Free AI resume builder',
    'ATS-optimized rewrite',
    'Tailored cover letter',
    'Interview best-match keyword score',
    'High scorer ATS scoring',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
      </head>
      <body className="antialiased min-h-screen text-white flex flex-col">
        <div className="app-aurora" aria-hidden />
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
