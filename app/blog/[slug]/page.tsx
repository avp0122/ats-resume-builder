import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getPost, listSlugs } from '@/lib/blog';

const SITE_URL = 'https://kairesume.fit';

interface RouteParams {
  params: { slug: string };
}

export async function generateStaticParams() {
  const slugs = await listSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return { title: 'Post not found' };
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `${SITE_URL}/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.date,
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

export const revalidate = 86400;

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Tailwind classes for MDX-rendered HTML. Applied via `components` prop on
// <MDXRemote /> so authors don't need to repeat class names per file.
const mdxComponents = {
  h1: (props: any) => (
    <h1 className="mt-8 mb-4 text-3xl font-bold text-white tracking-tight" {...props} />
  ),
  h2: (props: any) => (
    <h2 className="mt-10 mb-3 text-2xl font-semibold text-white tracking-tight" {...props} />
  ),
  h3: (props: any) => (
    <h3 className="mt-6 mb-2 text-xl font-semibold text-white" {...props} />
  ),
  p: (props: any) => <p className="my-4 text-white/80 leading-relaxed" {...props} />,
  ul: (props: any) => <ul className="my-4 ml-6 list-disc space-y-1 text-white/80" {...props} />,
  ol: (props: any) => <ol className="my-4 ml-6 list-decimal space-y-1 text-white/80" {...props} />,
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  a: (props: any) => (
    <a
      className="text-fuchsia-300 underline decoration-fuchsia-300/40 hover:decoration-fuchsia-300"
      {...props}
    />
  ),
  code: (props: any) => (
    <code className="px-1.5 py-0.5 rounded bg-white/10 text-fuchsia-200 text-sm" {...props} />
  ),
  pre: (props: any) => (
    <pre
      className="my-4 p-4 rounded-lg bg-slate-900/60 border border-white/10 overflow-x-auto text-sm"
      {...props}
    />
  ),
  blockquote: (props: any) => (
    <blockquote
      className="my-6 pl-4 border-l-2 border-fuchsia-400/50 text-white/70 italic"
      {...props}
    />
  ),
  hr: () => <hr className="my-8 border-white/10" />,
  strong: (props: any) => <strong className="text-white" {...props} />,
};

export default async function BlogPostPage({ params }: RouteParams) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  // Article schema for search + answer engines. Tags become keywords.
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Person',
      name: 'Andrei VP',
      url: `${SITE_URL}/about`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'kairesume',
      url: SITE_URL,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/blog/${post.slug}` },
    keywords: post.tags.join(', '),
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <nav className="text-sm text-white/50 mb-6">
        <Link href="/blog" className="hover:text-white">
          ← All posts
        </Link>
      </nav>
      <article>
        <header className="mb-8 not-prose">
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
            {post.title}
          </h1>
          <div className="mt-4 flex items-center gap-3 text-sm text-white/50">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span>·</span>
            <span>{post.readingMinutes} min read</span>
          </div>
          <p className="mt-4 text-lg text-white/70 leading-relaxed">{post.description}</p>
        </header>
        <div className="text-white/80">
          {/* MDXRemote on the App Router runs server-side — no client JS shipped for body content. */}
          <MDXRemote source={post.body} components={mdxComponents} />
        </div>
      </article>

      <aside className="mt-16 p-6 rounded-xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/10 via-indigo-500/10 to-sky-400/10">
        <h2 className="text-xl font-semibold text-white">Try kairesume free</h2>
        <p className="mt-2 text-white/70">
          Paste a job description, upload your resume, get an ATS-optimized rewrite and a
          tailored cover letter in under a minute. First generation is free, no signup.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block px-5 py-2.5 rounded-md bg-white text-slate-950 font-medium hover:bg-white/90 transition"
        >
          Generate your resume →
        </Link>
      </aside>
    </main>
  );
}
