import { groq } from '@ai-sdk/groq';
import { streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { consumeChatQuota } from '@/lib/rag/chatQuota';
import { retrieveContext, type RetrievedChunk } from '@/lib/rag/retrieve';
import { buildSystemPrompt } from '@/lib/rag/systemPrompt';
import { SIGNED_IN_FREE_CHAT_MESSAGES } from '@/lib/pricing';

/**
 * POST /api/chat — the kairesume chat assistant (DECISION 031, PR 3).
 *
 * Flow:
 *   1. Quota gate (consumeChatQuota) BEFORE the LLM call. Over-limit → 429.
 *   2. Retrieve grounding chunks for the latest user message (non-fatal:
 *      if RAG infra is unavailable we answer without context).
 *   3. Stream a Groq Llama 3.3 70B answer back via the Vercel AI SDK data
 *      stream, which the client's useChat consumes.
 *
 * nodejs runtime: we read cookies + use the Supabase service-role client.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'llama-3.3-70b-versatile';
const MAX_HISTORY = 24; // turns forwarded to the model
const MAX_CONTENT_CHARS = 4000; // per message
const TOP_K = 6;

interface IncomingMessage {
  role?: unknown;
  content?: unknown;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is IncomingMessage =>
        !!m &&
        typeof m === 'object' &&
        ((m as IncomingMessage).role === 'user' ||
          (m as IncomingMessage).role === 'assistant') &&
        typeof (m as IncomingMessage).content === 'string'
    )
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: (m.content as string).slice(0, MAX_CONTENT_CHARS),
    }))
    .slice(-MAX_HISTORY);
}

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: 'Chat is not configured on this deployment.' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const messages = sanitizeMessages((body as { messages?: unknown })?.messages);
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser || !lastUser.content.trim()) {
    return NextResponse.json({ error: 'No user message provided.' }, { status: 400 });
  }

  // 1) Quota gate — before any paid work.
  let quota;
  try {
    quota = await consumeChatQuota();
  } catch (e) {
    console.error('[chat] quota check failed:', e);
    quota = null; // fail open rather than blocking on an internal error
  }

  if (quota && !quota.allowed) {
    const message = quota.signedIn
      ? `You've used today's ${quota.limit} free chat messages. The limit resets at midnight UTC — or upgrade to Pro for unlimited chat.`
      : `You've used today's ${quota.limit} free chat messages. Sign up free for ${SIGNED_IN_FREE_CHAT_MESSAGES}/day, or come back tomorrow.`;
    return NextResponse.json(
      {
        error: message,
        limitReached: true,
        upgradeRequired: quota.signedIn && quota.plan === 'free',
      },
      { status: 429 }
    );
  }

  // 2) Retrieve grounding context — non-fatal.
  let context: RetrievedChunk[] = [];
  try {
    context = await retrieveContext(lastUser.content, TOP_K);
  } catch (e) {
    console.warn(
      '[chat] retrieval failed, answering without grounding:',
      e instanceof Error ? e.message : e
    );
  }

  // 3) Stream the answer.
  const result = streamText({
    model: groq(MODEL),
    system: buildSystemPrompt(context),
    messages,
    temperature: 0.4,
    maxTokens: 700,
  });

  return result.toDataStreamResponse();
}
