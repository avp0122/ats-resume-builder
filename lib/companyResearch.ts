/**
 * Company research via Tavily Search API.
 *
 * Tavily is an AI-agent-targeted search API. Free tier: 1000 queries/month.
 * Docs: https://docs.tavily.com/
 *
 * We use it to enrich the cover letter prompt with a short, fresh summary
 * of the target company — what they actually do, their products, their
 * recent moves — instead of letting the LLM guess from training data or
 * over-rely on the JD's marketing copy.
 *
 * Behaviour is intentionally fail-soft: any failure (no API key, network
 * error, timeout, malformed response) returns `null` and the calling
 * code falls back to the JD-only cover-letter flow. We never block
 * generation on this.
 */

export interface CompanyContext {
  /** The company name we searched for, echoed back for logging. */
  company: string;
  /** 1-3 short snippets concatenated, capped at ~600 chars total. */
  summary: string;
  /** Top result URL — useful when debugging which page Tavily found. */
  sourceUrl?: string;
}

interface TavilyResult {
  url?: string;
  title?: string;
  content?: string;
  score?: number;
}

interface TavilyResponse {
  results?: TavilyResult[];
  answer?: string;
}

const ENDPOINT = 'https://api.tavily.com/search';
const TIMEOUT_MS = 3500;
/**
 * Hard cap on the total context we feed back into the LLM. Each result's
 * `content` snippet is usually 300-800 chars; we concatenate the top 3
 * and trim to 600 chars total. Anything longer just bloats the prompt
 * without adding signal.
 */
const MAX_CONTEXT_CHARS = 600;

function getApiKey(): string | null {
  // Server-side only; never NEXT_PUBLIC_*. If unset, the feature is silently
  // disabled and the calling code falls back to JD-only generation.
  const key = process.env.TAVILY_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

export function isCompanyResearchConfigured(): boolean {
  return Boolean(getApiKey());
}

/**
 * Pull a 1-paragraph factual summary of the company. Returns `null` for
 * any error path so callers can do `if (!ctx) skip enrichment;`.
 */
export async function researchCompany(company: string): Promise<CompanyContext | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const trimmed = company.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // `search_depth: "basic"` is the cheap variant (~1s, 1 credit). The
    // "advanced" variant takes 3-5s and costs 2 credits — overkill for
    // our use case where we only want a paragraph of context.
    //
    // Query phrasing: "what does X do" tends to surface About-page-like
    // pages over press releases or job listings. "company overview"
    // alone biases toward Crunchbase / LinkedIn which have less useful
    // snippets.
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query: `What does ${trimmed} do? Products, mission, recent news.`,
        search_depth: 'basic',
        max_results: 3,
        include_answer: true,
      }),
    });

    if (!res.ok) {
      // 429 is the rate-limit / quota-exhausted signal. Log it loudly even
      // in production so you can see when the Tavily free tier is exhausted
      // and decide whether to upgrade. The downstream effect is automatic:
      // the calling code keeps the first-pass (humanized JD-only) cover
      // letter from generateATSContent and the user gets that instead.
      if (res.status === 429) {
        console.warn(
          `Tavily rate limit hit (429) for "${trimmed}" — falling back to JD-only cover letter. Free-tier quota exhausted or per-second cap exceeded.`
        );
      } else if (res.status === 401 || res.status === 403) {
        console.warn(
          `Tavily auth error (${res.status}) — check TAVILY_API_KEY. Falling back to JD-only cover letter.`
        );
      } else if (process.env.NODE_ENV !== 'production') {
        console.warn(
          'Tavily HTTP error:',
          res.status,
          await res.text().catch(() => '')
        );
      }
      return null;
    }

    const data = (await res.json()) as TavilyResponse;

    // Prefer the `answer` field if Tavily produced one — it's already a
    // synthesised summary. Fall back to concatenating the top results'
    // content snippets.
    let raw = '';
    if (typeof data.answer === 'string' && data.answer.trim()) {
      raw = data.answer.trim();
    } else if (Array.isArray(data.results)) {
      raw = data.results
        .slice(0, 3)
        .map((r) => (typeof r.content === 'string' ? r.content.trim() : ''))
        .filter(Boolean)
        .join(' ');
    }

    if (!raw) return null;

    // Normalise whitespace and clip. Tavily occasionally returns text with
    // embedded newlines and unicode whitespace — flatten to single spaces
    // so the downstream LLM prompt stays predictable.
    const summary = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXT_CHARS);

    const sourceUrl =
      Array.isArray(data.results) && data.results[0]?.url
        ? data.results[0].url
        : undefined;

    return { company: trimmed, summary, sourceUrl };
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        'Tavily research failed:',
        e instanceof Error ? e.message : String(e)
      );
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
