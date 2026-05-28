/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [];
  },
  webpack: (config, { isServer }) => {
    // `@turbodocx/html-to-docx` was forked from a Node-only library. Even
    // its ESM build still has top-level `import 'fs' / 'http' / 'crypto'`
    // statements that webpack can't resolve when we bundle for the browser
    // — but those code paths are gated behind `typeof Buffer !== 'undefined'`
    // feature detection at runtime, so they're never actually executed in a
    // browser. We stub the Node built-ins to empty modules for the client
    // bundle so the build resolves; the unreachable Node branches stay
    // unreachable. Server bundle is untouched.
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        http: false,
        https: false,
        path: false,
        crypto: false,
        stream: false,
        util: false,
        assert: false,
        tty: false,
        os: false,
        zlib: false,
        events: false,
        url: false,
        punycode: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
