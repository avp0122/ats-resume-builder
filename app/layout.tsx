import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import RouteProgress from '@/components/RouteProgress';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: 'kresume — AI ATS resume & cover letter generator',
  description:
    'Generate ATS-optimized resumes and tailored cover letters with an instant match score. Free to try, pay once in crypto for unlimited use.',
  keywords: ['resume', 'cover letter', 'ATS', 'job application', 'AI', 'crypto'],
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
      </body>
    </html>
  );
}
