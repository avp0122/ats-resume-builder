import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ATS Resume & Cover Letter Generator',
  description: 'Generate ATS-optimized resumes and tailored cover letters powered by AI',
  keywords: ['resume', 'cover letter', 'ATS', 'job application', 'AI'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
