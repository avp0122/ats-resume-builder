import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

/**
 * Filesystem-backed blog. Posts are MDX files in `content/blog/*.mdx`. Each
 * post has frontmatter:
 *
 *   ---
 *   title: "..."
 *   description: "..."           # used for <meta>, OpenGraph, and the index card
 *   date: "2026-05-26"           # ISO date, used for sorting + Article schema
 *   tags: ["ats", "devops"]      # used for the index page filters (future)
 *   readingMinutes: 5            # estimate shown on the index card
 *   ---
 *
 *   ...mdx body...
 *
 * Posts are read once per build (cached in module scope) — adding a new
 * post requires a deploy, which is what we want for SEO (every URL is a
 * statically rendered HTML doc).
 */

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  readingMinutes: number;
}

export interface Post extends PostMeta {
  /** Raw MDX body (frontmatter already stripped). */
  body: string;
}

const POSTS_DIR = path.join(process.cwd(), 'content', 'blog');

let listCache: PostMeta[] | null = null;

async function readPostFile(slug: string): Promise<Post> {
  const file = await fs.readFile(path.join(POSTS_DIR, `${slug}.mdx`), 'utf8');
  const { data, content } = matter(file);
  return {
    slug,
    title: String(data.title ?? slug),
    description: String(data.description ?? ''),
    date: String(data.date ?? ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    readingMinutes: Number(data.readingMinutes ?? 5),
    body: content,
  };
}

export async function listPosts(): Promise<PostMeta[]> {
  if (listCache) return listCache;
  let entries: string[];
  try {
    entries = await fs.readdir(POSTS_DIR);
  } catch {
    listCache = [];
    return listCache;
  }
  const slugs = entries
    .filter((name) => name.endsWith('.mdx'))
    .map((name) => name.replace(/\.mdx$/, ''));
  const posts = await Promise.all(slugs.map(readPostFile));
  // Newest first by ISO date — frontmatter must be ISO-formatted for this to sort right.
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  listCache = posts.map(({ body: _body, ...meta }) => meta);
  return listCache;
}

export async function getPost(slug: string): Promise<Post | null> {
  try {
    return await readPostFile(slug);
  } catch {
    return null;
  }
}

export async function listSlugs(): Promise<string[]> {
  const posts = await listPosts();
  return posts.map((p) => p.slug);
}
