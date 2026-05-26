import type { Metadata } from 'next';
import Link from 'next/link';
import { listPosts } from '@/lib/blog';

const SITE_URL = 'https://kairesume.fit';

export const metadata: Metadata = {
  title: 'Blog — ATS resume tips, DevOps keywords, remote job advice',
  description:
    'Practical guides on getting past ATS filters, picking resume keywords for DevOps / Cloud / SRE roles, and applying to global remote jobs from anywhere.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: 'kairesume blog — ATS, keywords, remote',
    description:
      'Practical guides on ATS resume parsing, DevOps / Cloud / SRE resume keywords, and applying to global remote jobs.',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
};

// Revalidate once a day; posts are MDX in the repo so a deploy refreshes
// them anyway, but ISR avoids re-reading the files on every request.
export const revalidate = 86400;

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default async function BlogIndexPage() {
  const posts = await listPosts();

  // Blog index as Schema.org Blog — helps search engines understand this
  // is a publication, distinct from product pages.
  const blogJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'kairesume blog',
    url: `${SITE_URL}/blog`,
    description: metadata.description,
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.description,
      datePublished: p.date,
      url: `${SITE_URL}/blog/${p.slug}`,
      keywords: p.tags.join(', '),
    })),
  };

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />
      <header className="mb-10">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
          The kairesume blog
        </h1>
        <p className="mt-3 text-white/70 text-lg max-w-2xl">
          Practical guides on getting past ATS filters, picking the right resume keywords,
          and applying to remote roles from anywhere.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-white/60">No posts yet — check back soon.</p>
      ) : (
        <ul className="space-y-6">
          {posts.map((post) => (
            <li
              key={post.slug}
              className="rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition"
            >
              <Link href={`/blog/${post.slug}`} className="block p-6">
                <div className="flex items-center gap-3 text-xs text-white/50">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  <span>·</span>
                  <span>{post.readingMinutes} min read</span>
                  {post.tags.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="flex gap-1.5">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-white/5 text-white/60"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    </>
                  )}
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white group-hover:text-fuchsia-300">
                  {post.title}
                </h2>
                <p className="mt-2 text-white/70">{post.description}</p>
                <span className="mt-3 inline-block text-sm text-fuchsia-300">
                  Read article →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
