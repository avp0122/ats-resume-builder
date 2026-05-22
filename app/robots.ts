import type { MetadataRoute } from 'next';

const SITE_URL = 'https://kairesume.fit';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default: everything is crawlable except API + private/account
      // pages. Auth pages (signin/signup) stay crawlable so they show
      // up in branded searches, but the account page itself does not.
      {
        userAgent: '*',
        allow: ['/', '/llms.txt'],
        disallow: ['/api/', '/account', '/checkout'],
      },

      // Explicit AI-crawler allowlist. Functionally redundant with the
      // wildcard above, but listing each agent explicitly is the AEO /
      // GEO best practice — it signals clear consent and many AI
      // crawlers look for their own UA before falling back to `*`.
      // Order matters for human readability only; robots.txt matches
      // on the most specific UA regardless of file order.

      // OpenAI: GPTBot (training), ChatGPT-User (in-chat browsing),
      // OAI-SearchBot (ChatGPT search index).
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot'],
        allow: '/',
      },

      // Anthropic: ClaudeBot (current crawler), anthropic-ai (older
      // training-only UA), Claude-Web (in-chat browsing).
      {
        userAgent: ['ClaudeBot', 'anthropic-ai', 'Claude-Web'],
        allow: '/',
      },

      // Common Crawl — open dataset used as input by basically every
      // AI training pipeline. Allowing it is the lowest-friction way
      // to be discoverable for AI-trained answer engines.
      { userAgent: 'CCBot', allow: '/' },

      // Perplexity AI: index crawler + per-query user-initiated fetch.
      { userAgent: ['PerplexityBot', 'PerplexityBot-User'], allow: '/' },

      // Google-Extended is not a real crawler — it's a robots.txt token
      // that controls whether Googlebot's regular crawl can be used to
      // train Gemini / Vertex AI. Allow: / opts us IN.
      { userAgent: 'Google-Extended', allow: '/' },

      // Applebot-Extended is the same pattern as Google-Extended for
      // Apple Intelligence / Siri training. Allow: / opts us IN.
      { userAgent: 'Applebot-Extended', allow: '/' },

      // Meta: ExternalAgent (Llama training), FacebookBot (link unfurls).
      { userAgent: ['Meta-ExternalAgent', 'FacebookBot'], allow: '/' },

      // DuckDuckGo's AI assistant.
      { userAgent: 'DuckAssistBot', allow: '/' },

      // You.com.
      { userAgent: 'YouBot', allow: '/' },

      // ByteDance (TikTok / Doubao). Allow for now; some sites
      // disallow over data-handling concerns — easy to remove later.
      { userAgent: 'Bytespider', allow: '/' },

      // Amazon: Amazonbot indexes for Alexa + Bedrock.
      { userAgent: 'Amazonbot', allow: '/' },

      // Cohere + Mistral training crawlers.
      { userAgent: ['cohere-ai', 'Cohere-AI'], allow: '/' },
      { userAgent: ['mistral-ai', 'MistralAI-User'], allow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
