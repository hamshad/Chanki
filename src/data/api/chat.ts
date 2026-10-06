/**
 * OpenRouter chat completion for the assistant screen.
 *
 * One model, one system prompt: terse, factual replies — no greetings,
 * no praise, no filler. The key is a public VITE_ value shipped in the
 * bundle (accepted trade-off for this build); failures surface as plain
 * Error messages the UI can show verbatim.
 */
import * as z from 'zod'
import { ApiError } from './http'
import type { ChatMessage } from '../chatThread'
import type { ChatLang } from '../../utils/chatLang'

export const CHAT_MODEL = 'inclusionai/ling-3.0-flash-sante:free'
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const TIMEOUT_MS = 30_000
/** History sent to the model — stored thread can be longer than context. */
export const MAX_CONTEXT_MESSAGES = 30
/** Belt-and-braces brevity limit on top of the prompt. */
const MAX_TOKENS = 1024

export const CHAT_SYSTEM_PROMPT = [
  'You are a precise answer engine for Chinese language and China culture inside a flashcard app.',
  'Scope: Chinese only.',
  '- Every word, character or phrase is answered as Mandarin Chinese (simplified): meaning, pinyin with tone marks, usage.',
  '- If the same word also exists in Japanese or another language, ignore that — answer the Chinese meaning only.',
  '- History, customs and culture questions: China only.',
  '- Anything outside Chinese language and China culture: reply exactly: out of scope.',
  'Style:',
  '- Be brief and dense: at most 5 sentences or 5 bullet points. Pack in the facts, then stop.',
  '- Reply like a machine returning a result: direct, neutral, no personality.',
  '- Never greet, thank, praise, approve, encourage, apologize, or restate the question.',
  '- No filler, no preamble, no closing summary, no offers to help further, no sign-off, no emoji.',
  '- One line is enough when the answer is short. If unsure, reply exactly: unknown.',
].join('\n')

const ReplySchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
})

const KeySchema = z.object({
  data: z.object({
    free_model_daily_requests: z.object({
      used: z.number(),
      limit: z.number(),
      remaining: z.number(),
    }),
  }),
})

export interface ChatQuota {
  used: number
  limit: number
  remaining: number
}

/**
 * Fold a fresh server quota into the shown one. The server counter lags
 * behind real usage, so a same-day server value that knows FEWER sends
 * than we show is stale — keep ours. A new UTC day (or no previous value)
 * adopts the server value wholesale.
 */
export function mergeQuota(
  prev: ChatQuota | null,
  prevDay: string,
  next: ChatQuota,
  today: string,
): { quota: ChatQuota; day: string } {
  if (!prev || prevDay !== today) return { quota: next, day: today }
  return next.used > prev.used ? { quota: next, day: today } : { quota: prev, day: prevDay }
}

export function chatKey(): string {
  return import.meta.env.OPENROUTER_KEY?.trim() ?? ''
}

const LANG_RULES: Record<ChatLang, string> = {
  en: 'Explain in English. The entire reply is English, except Chinese words and characters which stay in hanzi with pinyin.',
  // Roman Hindi means Latin script — the model must not reach for Devanagari,
  // and must not slide back into English mid-reply.
  'hi-Latn':
    'Explain in Roman Hindi: Hindi written in Latin/Roman script only, never Devanagari. The ENTIRE reply — every sentence — is Roman Hindi. Do not write any sentence in English. Chinese words and characters stay in hanzi with pinyin.',
}

/**
 * Base prompt with the answer-language rule FIRST: the opening instruction
 * anchors the reply language, the closing style rules shape the rest.
 * Unknown codes fall back to English.
 */
export function buildSystemPrompt(lang: ChatLang = 'en'): string {
  return `Language:\n- ${LANG_RULES[lang] ?? LANG_RULES.en}\n${CHAT_SYSTEM_PROMPT}`
}

/**
 * Enforcement suffix stamped on the last user message of each request (the
 * stored thread keeps the clean text). History drag — earlier replies in
 * another language — pulls small models back to that language; a fresh
 * instruction on the newest turn counteracts it. Empty for English.
 */
const ENFORCE_SUFFIX: Record<ChatLang, string> = {
  en: '',
  'hi-Latn': '\n\n[Reply ENTIRELY in Roman Hindi (Latin script). No English sentences.]',
}

export function enforceSuffix(lang: ChatLang): string {
  return ENFORCE_SUFFIX[lang] ?? ''
}

/**
 * Free-model daily quota for the key's account (`used`/`limit`/`remaining`,
 * resets UTC midnight). Never throws — the UI treats it as decoration and
 * hides it when unknown.
 */
export async function fetchQuota(): Promise<ChatQuota | null> {
  const key = chatKey()
  if (!key) return null
  try {
    const res = await fetch('https://openrouter.ai/api/v1/key', {
      // The counter must be fresh — a cached copy looks like a stuck quota.
      cache: 'no-store',
      headers: { authorization: `Bearer ${key}` },
    })
    if (!res.ok) return null
    const parsed = KeySchema.safeParse(await res.json())
    return parsed.success ? parsed.data.data.free_model_daily_requests : null
  } catch {
    return null
  }
}

export interface AskOptions {
  signal?: AbortSignal
  lang?: ChatLang
}

/** POST the thread + system prompt, return the assistant's text. Throws on failure. */
export async function askChat(
  history: ChatMessage[],
  { signal, lang = 'en' }: AskOptions = {},
): Promise<string> {
  const key = chatKey()
  if (!key) throw new Error('OPENROUTER_KEY is not set — add it to .env and rebuild.')

  const suffix = enforceSuffix(lang)
  const context = history.slice(-MAX_CONTEXT_MESSAGES).map((m, i, arr) => ({
    role: m.role,
    // Only the newest user turn carries the suffix; stored history untouched.
    content: suffix && m.role === 'user' && i === arr.length - 1 ? m.text + suffix : m.text,
  }))
  const messages = [{ role: 'system', content: buildSystemPrompt(lang) }, ...context]

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort)

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'x-title': 'Chanki',
      },
      body: JSON.stringify({ model: CHAT_MODEL, messages, max_tokens: MAX_TOKENS }),
    })
    if (!res.ok) throw new ApiError(ENDPOINT, res.status)
    const parsed = ReplySchema.safeParse(await res.json())
    if (!parsed.success) throw new Error('assistant returned a malformed reply')
    const text = parsed.data.choices[0].message.content.trim()
    if (!text) throw new Error('assistant returned an empty reply')
    return text
  } catch (err) {
    if (err instanceof ApiError) throw new Error(`assistant request failed (${err.status})`)
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(signal?.aborted ? 'assistant request cancelled' : 'assistant request timed out')
    }
    if (err instanceof Error && err.message.startsWith('assistant ')) throw err
    // Network failure, JSON parse failure, schema mismatch.
    throw new Error('assistant unreachable — check your connection')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
