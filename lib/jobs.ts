/**
 * Remote-job aggregator for the /jobs page.
 *
 * Pulls from two public APIs (RemoteOK and Remotive), filters to DevOps /
 * SRE / Cloud / Platform / Kubernetes roles posted in the last 24 hours
 * that are open to candidates in France (Worldwide, Europe, or France
 * explicitly — strict US-only postings are rejected).
 *
 * Both APIs are free, no key. Per their ToS we attribute back per-job and
 * cache for 24h (the page sets `revalidate = 86400`), so we hit them at
 * most once a day. Both APIs ask for "max ~4 fetches/day" — we're well
 * inside that.
 *
 * IMPORTANT (ToS):
 *   - RemoteOK: "Please link back (with follow, and without nofollow!) to
 *     the URL on Remote OK and mention Remote OK as a source."
 *   - Remotive: "Please link back to the URL found on Remotive AND
 *     mention Remotive as a source." Jobs delayed by 24h on their end.
 *
 * The /jobs page renders an attribution line in the footer and a per-row
 * source badge for compliance with both clauses.
 */

export interface Job {
  /** Stable key across both sources. Used as React key + dedupe. */
  id: string;
  /** "Senior DevOps Engineer" etc. */
  title: string;
  /** "Acme Corp" etc. */
  company: string;
  /** Apply URL, must link back to the source per ToS. */
  url: string;
  /** ISO date string of when the job was posted. */
  postedAt: string;
  /** Hours since posting, computed at fetch time. */
  hoursAgo: number;
  /** "Worldwide" / "EU" / "France" etc. */
  location: string;
  /** First 4 tags to render as chips. */
  tags: string[];
  source: 'remoteok' | 'remotive';
}

const ROLE_REGEX =
  /\b(devops|sre|site\s*reliability|cloud|platform|kubernetes|infrastructure|infra)\s*(engineer|architect|developer|specialist)?\b/i;

/**
 * Locations we accept. Anything that doesn't strictly exclude France passes.
 *
 * Order of checks (per job):
 *   1. If the role title doesn't match ROLE_REGEX → reject.
 *   2. If posted > 24h ago → reject.
 *   3. If the candidate_required_location contains "USA only", "US only",
 *      "United States only", "Canada only", "UK only" etc. → reject.
 *   4. Otherwise → accept.
 */
function locationAcceptsFrance(raw: string): boolean {
  if (!raw) return true; // unspecified means open to all
  const s = raw.toLowerCase();
  // Reject obvious geo-locks.
  if (/\b(usa|us|united states|canada|uk|united kingdom|australia|india|brazil|germany|japan|singapore)\s*only\b/.test(s))
    return false;
  if (/\bonly in (the )?(usa|us|united states|canada|uk|australia)\b/.test(s)) return false;
  // Accept the common positives explicitly.
  if (/(worldwide|anywhere|global|europe|eu|emea|france|remote)/.test(s)) return true;
  // Anything else (specific city / country) that didn't say "only" — accept;
  // these are often "preferred location" rather than hard requirements.
  return true;
}

function hoursSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (1000 * 60 * 60);
}

interface RemoteOkRaw {
  id?: string | number;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  location?: string;
  url?: string;
  apply_url?: string;
}

async function fetchRemoteOk(): Promise<Job[]> {
  // RemoteOK doesn't accept arbitrary multi-tag queries — we hit the
  // top-level feed (returns ~100 most recent across all tags) and filter
  // client-side. Simpler than juggling tag-specific endpoints, and the
  // free feed updates often enough that 24h of jobs always appears here.
  let raw: unknown;
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': 'kairesume-jobs/1.0 (+https://kairesume.fit/jobs)' },
      next: { revalidate: 86400, tags: ['jobs'] },
    });
    if (!res.ok) return [];
    raw = await res.json();
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  // First item is a metadata/legal object — filter it out by requiring an `id` field.
  const jobs = (raw as RemoteOkRaw[]).filter((j) => j && typeof j === 'object' && j.id);
  return jobs
    .map((j): Job | null => {
      const title = String(j.position ?? '');
      const company = String(j.company ?? '');
      const url = String(j.apply_url ?? j.url ?? '');
      const postedAt = j.date ?? (j.epoch ? new Date(j.epoch * 1000).toISOString() : '');
      const location = String(j.location ?? '');
      const tags = Array.isArray(j.tags) ? j.tags.map(String) : [];
      const hoursAgo = hoursSince(postedAt);
      if (!title || !url || !postedAt) return null;
      if (hoursAgo > 24) return null;
      if (!ROLE_REGEX.test(title) && !tags.some((t) => ROLE_REGEX.test(t))) return null;
      if (!locationAcceptsFrance(location)) return null;
      return {
        id: `remoteok-${j.id}`,
        title,
        company,
        url,
        postedAt,
        hoursAgo,
        location: location || 'Remote',
        tags: tags.slice(0, 4),
        source: 'remoteok',
      };
    })
    .filter((j): j is Job => j !== null);
}

interface RemotiveRaw {
  jobs?: Array<{
    id?: number;
    url?: string;
    title?: string;
    company_name?: string;
    category?: string;
    tags?: string[];
    publication_date?: string;
    candidate_required_location?: string;
  }>;
}

async function fetchRemotive(): Promise<Job[]> {
  // Remotive returns ~100 most recent jobs per category. devops is the
  // closest match for our audience; the title regex covers SRE, cloud,
  // platform, kubernetes etc. that may be tagged elsewhere.
  let raw: RemotiveRaw;
  try {
    const res = await fetch('https://remotive.com/api/remote-jobs?category=devops', {
      headers: { 'User-Agent': 'kairesume-jobs/1.0 (+https://kairesume.fit/jobs)' },
      next: { revalidate: 86400, tags: ['jobs'] },
    });
    if (!res.ok) return [];
    raw = (await res.json()) as RemotiveRaw;
  } catch {
    return [];
  }
  const list = Array.isArray(raw.jobs) ? raw.jobs : [];
  return list
    .map((j): Job | null => {
      const title = String(j.title ?? '');
      const company = String(j.company_name ?? '');
      const url = String(j.url ?? '');
      const postedAt = String(j.publication_date ?? '');
      const location = String(j.candidate_required_location ?? '');
      const tags = Array.isArray(j.tags) ? j.tags.map(String) : [];
      const hoursAgo = hoursSince(postedAt);
      if (!title || !url || !postedAt) return null;
      if (hoursAgo > 24) return null;
      if (!ROLE_REGEX.test(title) && !tags.some((t) => ROLE_REGEX.test(t))) return null;
      if (!locationAcceptsFrance(location)) return null;
      return {
        id: `remotive-${j.id}`,
        title,
        company,
        url,
        postedAt,
        hoursAgo,
        location: location || 'Remote',
        tags: tags.slice(0, 4),
        source: 'remotive',
      };
    })
    .filter((j): j is Job => j !== null);
}

function dedupe(jobs: Job[]): Job[] {
  // Same company + same title posted within an hour of each other =
  // probably the same opening cross-listed on both boards. Keep the
  // newest copy.
  const out: Job[] = [];
  const seen = new Map<string, Job>();
  for (const job of jobs) {
    const key = `${job.company.toLowerCase().trim()}|${job.title.toLowerCase().trim()}`;
    const prev = seen.get(key);
    if (!prev || job.hoursAgo < prev.hoursAgo) seen.set(key, job);
  }
  for (const j of seen.values()) out.push(j);
  out.sort((a, b) => a.hoursAgo - b.hoursAgo);
  return out;
}

export async function listJobs(): Promise<Job[]> {
  // Fan out — if one source is down or rate-limited the other still returns.
  const [a, b] = await Promise.all([fetchRemoteOk(), fetchRemotive()]);
  return dedupe([...a, ...b]);
}
