import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import RouteProgress from '@/components/RouteProgress';
import SupportWidget from '@/components/SupportWidget';
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

// Three structured-data blobs, all shipped together in the layout head:
//   1. Organization — answer engines (Perplexity, ChatGPT, Gemini) and
//      Google's knowledge panel use this for the brand box.
//   2. WebApplication — Google/Bing surface it for app rich results
//      and price snippets in SERP. Same shape as before plus richer
//      featureList and aggregateRating-ready hooks.
//   3. SoftwareApplication offers — separately so search engines pick
//      up the multi-tier pricing as Offer rich results.
const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  description:
    'kairesume is an AI resume builder that rewrites resumes against any job description, scores them against ATS keyword matching, and produces a tailored cover letter — free to try, $4.99/month Pro.',
  // sameAs would list official social handles once they exist.
  // logo would point at /icon.svg (Next.js auto-serves it).
};

const APP_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Resume Builder',
  operatingSystem: 'Any',
  browserRequirements: 'Requires a modern browser with JavaScript enabled.',
  inLanguage: 'en',
  isAccessibleForFree: true,
  offers: [
    {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'USD',
      description:
        '1 free generation without sign-up; 3 generations / month after free sign-up.',
    },
    {
      '@type': 'Offer',
      name: 'Pro · 1 month',
      price: '4.99',
      priceCurrency: 'USD',
      description: 'Unlimited generations, monthly.',
    },
    {
      '@type': 'Offer',
      name: 'Pro · 3 months',
      price: '11.98',
      priceCurrency: 'USD',
      description: 'Unlimited generations, 3 months prepaid — 20% off vs monthly.',
    },
    {
      '@type': 'Offer',
      name: 'Pro · 1 year',
      price: '41.92',
      priceCurrency: 'USD',
      description: 'Unlimited generations, 1 year prepaid — 30% off vs monthly.',
    },
  ],
  featureList: [
    'Free AI resume builder',
    'ATS-optimized rewrite for Applicant Tracking Systems',
    'Tailored cover letter writer',
    'Interview-best-match keyword scoring',
    'Matched + missing keyword breakdown',
    'High-scorer ATS score (0–100)',
    'PDF + ZIP download',
    'Crypto payments — USDT on Tron or Ethereum',
  ],
};

// HowTo for AEO — answer engines love step-by-step structured data
// because they can render it as a numbered card directly in the
// response ("To get an ATS-optimized resume from kairesume: …").
const HOW_TO_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to generate an ATS-optimized resume with kairesume',
  description:
    'Tailor your resume to a specific job description in under a minute with kairesume.',
  totalTime: 'PT1M',
  estimatedCost: { '@type': 'MonetaryAmount', currency: 'USD', value: '0' },
  supply: [
    { '@type': 'HowToSupply', name: 'Your current resume (PDF or DOCX)' },
    { '@type': 'HowToSupply', name: 'The target job description (copy-pasted text)' },
  ],
  step: [
    {
      '@type': 'HowToStep',
      position: 1,
      name: 'Paste the job description',
      text: 'Copy the full job listing from the employer’s site and paste it into the Job description field on the kairesume home page.',
      url: `${SITE_URL}/#jd`,
    },
    {
      '@type': 'HowToStep',
      position: 2,
      name: 'Upload your resume',
      text: 'Drop your current resume into the upload area. PDF or DOCX, up to 10 MB. The file is processed in memory and discarded after generation.',
      url: `${SITE_URL}/#resume`,
    },
    {
      '@type': 'HowToStep',
      position: 3,
      name: 'Generate',
      text: 'Click Generate. In about 10 seconds you get a rewritten ATS-friendly resume, a tailored cover letter, and a 0–100 match score with the matched + missing keywords listed.',
      url: SITE_URL,
    },
    {
      '@type': 'HowToStep',
      position: 4,
      name: 'Download the ZIP',
      text: 'After a free signup, download a ZIP with both PDFs: <fullname>_resume.pdf and <fullname>_coverletter.pdf. The ZIP filename also embeds the target role and company so you can keep multiple applications straight.',
      url: SITE_URL,
    },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSONLD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(HOW_TO_JSONLD) }}
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
        <SupportWidget />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
