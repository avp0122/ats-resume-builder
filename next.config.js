/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Treat the PDF extractors as external on the server. Without this,
  // Next.js tries to bundle pdfjs-dist into the serverless lambda and
  // its dynamic-import paths (legacy/build/pdf.mjs, etc.) sometimes
  // resolve to a stub that throws at runtime — the symptom we saw on
  // Vercel was "could not extract text" with zero diagnostics. Same
  // for pdfreader and mammoth (DOCX) for the same reason.
  // Next 14 uses experimental.serverComponentsExternalPackages;
  // renamed to top-level `serverExternalPackages` in Next 15.
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist', 'pdfreader', 'mammoth'],
  },
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
