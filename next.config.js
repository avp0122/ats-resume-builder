/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Don't bundle these — they have native-ish dependencies and runtime
    // file resolution that Webpack can't reliably reproduce. Tell Next
    // to leave the require() calls alone and resolve them via Node's
    // normal module resolution at runtime in the lambda.
    serverComponentsExternalPackages: ['pdfjs-dist', 'pdfreader', 'mammoth'],
    // BELT AND BRACES: explicitly tell Vercel's file tracer (nft) to
    // ship the pdfjs-dist package files inside the lambda's
    // /var/task/node_modules. Without this, nft strips packages it
    // can't see being statically imported — and our pdfjs require()
    // is INSIDE a function (lazy), which nft sometimes misses. Same
    // for pdfreader and mammoth's vendor files (they have a "vendor"
    // dir of binary-ish JS that nft doesn't trace by default).
    outputFileTracingIncludes: {
      '/api/generate': [
        './node_modules/pdfjs-dist/**',
        './node_modules/pdfreader/**',
        './node_modules/mammoth/**',
      ],
    },
  },
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
