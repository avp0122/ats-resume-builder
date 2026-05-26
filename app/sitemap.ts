import type { MetadataRoute } from 'next';
import { listPosts } from '@/lib/blog';

const SITE_URL = 'https://kairesume.fit';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: Array<{ path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }> = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/blog', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/jobs', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/signup', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/signin', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  ];
  const staticEntries: MetadataRoute.Sitemap = pages.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // Blog posts — one entry per MDX file. `lastModified` uses the frontmatter
  // date so Search Console knows when individual posts changed without us
  // having to re-deploy the whole site just to bump the timestamp.
  const posts = await listPosts();
  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date + 'T00:00:00Z'),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [...staticEntries, ...postEntries];
}
