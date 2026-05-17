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
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
