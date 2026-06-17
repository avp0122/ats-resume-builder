/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [];
  },
  webpack: (config) => {
    // @turbodocx/html-to-docx (used by /api/docx) optionally requires `sharp`
    // for embedding images into DOCX. We render text-only documents and never
    // hit that code path, and `sharp` is a heavy native dependency we don't
    // want in the Vercel bundle. Aliasing it to `false` resolves the import to
    // an empty module so webpack stops emitting the (harmless) build warning:
    //   Module not found: Can't resolve 'sharp' in '.../@turbodocx/html-to-docx/dist'
    config.resolve.alias = { ...config.resolve.alias, sharp: false };
    return config;
  },
};

module.exports = nextConfig;
