/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist references the `canvas` module conditionally for Node
  // raster output. We never use raster output (we only call
  // getTextContent), so aliasing canvas → false stops Webpack from
  // erroring on the missing optional dep. This is the documented
  // pdfjs-dist + Next.js workaround.
  webpack: (config, { isServer }) => {
    if (isServer) {
      // resolve.alias may be undefined depending on the Webpack version;
      // initialise defensively.
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        canvas: false,
      };
    }
    return config;
  },
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
