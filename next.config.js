/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow external API calls to Groq and Gemini
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
