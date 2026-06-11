/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [];
  },
  experimental: {
    // @huggingface/transformers (used by /api/rag/embed for local bge-small
    // embeddings) ships ONNX runtime + sharp + a bunch of conditional
    // requires that webpack tries to follow and can't. Marking it external
    // tells Next.js to leave it in node_modules and `require()` it at
    // runtime instead. Same pattern Next docs recommend for other native /
    // ML libraries (pdf-parse, sharp, canvas, etc.).
    serverComponentsExternalPackages: ['@huggingface/transformers'],
  },
};

module.exports = nextConfig;
