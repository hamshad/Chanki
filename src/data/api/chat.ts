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
import { getChatModels } from '../firebase'

/**
 * Free models, in preference order — the DEFAULT when Remote Config has no
 * `chat_models` value. Override at runtime: Firebase console → Remote Config →
 * `chat_models` = comma-separated slugs. First entry is preferred, the rest
 * are fallbacks.
 *
 * Verified live against OpenRouter (Oct 2026): gemma-4-26b gives the best
 * structure adherence on the lesson format, the nemotron pair back it up.
 * Free slugs churn — a withdrawn variant (ling-3.0-flash-sante) 404s and the
 * walk below moves to the next one.
 */
export const CHAT_MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  // Permanent last resort: OpenRouter's own router, which always resolves to
  // whatever free models exist right now. Never withdrawn, so the chain cannot
  // bottom out — worst case the reply is off-format, not an error.
  'openrouter/free',
] as const

/** First-choice model — the one a reply names in errors and tests. */
export const CHAT_MODEL = CHAT_MODELS[0]

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
// Free reasoning models are slow — nemotron-3.5-lightning measured ~34s per
// reply. The old 30s ceiling aborted every request before it answered.
const TIMEOUT_MS = 90_000
/** History sent to the model — stored thread can be longer than context. */
export const MAX_CONTEXT_MESSAGES = 30
/** Belt-and-braces brevity limit on top of the prompt. */
const MAX_TOKENS = 1024
/** Low temperature: factual answers, steady instruction following. */
const TEMPERATURE = 0.3

export const CHAT_SYSTEM_PROMPT = [
  'You are a precise answer engine for Chinese language and China culture inside a flashcard app.',
  'Scope: Chinese only.',
  '- Every word, character or phrase is answered as Mandarin Chinese (simplified): meaning, pinyin with tone marks, usage.',
  '- If the same word also exists in Japanese or another language, ignore that — answer the Chinese meaning only.',
  '- History, customs and culture questions: China only.',
  '- Anything outside Chinese language and China culture: reply exactly: out of scope.',
  'Every reply uses this structure — nothing else:',
  '1. Opening line: In Mandarin Chinese, "the target" is: (the phrase in quotes, nothing after it).',
  '2. Then one ```chinese block: exactly 3 lines — hanzi, pinyin, meaning.',
  '3. Then, when the phrase is a multi-word sentence, a Word by word: section. One bullet per word: - 汉字 (pīnyīn) = meaning. Omit this section for single words or plain vocabulary.',
  '4. Then, when useful, a shorter natural version under "A more casual way to say it:", then a one-line Tip: with the real difference. Omit both when nothing to add.',
  'Never write any other section, heading, note, caveat or explanation. Never use bold, italics or backticks. Never list more than 8 sentences per reply.',
  'Formatting rules:',
  '- Always give hanzi, pinyin and meaning together, wherever a Chinese word appears.',
  '- Pinyin with tone marks, one space between syllables, a period at the end.',
  '- The ```chinese block holds ONE sentence. Never two. A bullet list goes inside the Word by word: section instead.',
  '- Short answers stay short: a single-word question gets the 3 lines and nothing more.',
  'Style:',
  '- Be brief and dense. Reply like a machine returning a result: direct, neutral, no personality.',
  '- Never greet, thank, praise, approve, encourage, apologize, or restate the question.',
  '- No filler, no preamble, no closing summary, no offers to help further, no sign-off, no emoji.',
  '- If unsure, reply exactly: unknown.',
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
  en: 'The entire reply is English except the hanzi and pinyin lines.',
  // Roman Hindi means Latin script — the model must not reach for Devanagari,
  // and must not slide back into English mid-reply.
  'hi-Latn':
    'The ENTIRE reply — every line — is Roman Hindi: Hindi in Latin/Roman script, never Devanagari. Not one line in English. The hanzi and pinyin lines are the only exceptions.',
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
  'hi-Latn':
    '\n\n[Reply ENTIRELY in Roman Hindi (Latin script). No English sentences — this overrides the language of previous replies.]',
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

  // Remote Config overrides the chain; the bundled list stays as the default
  // so an offline device or empty config still has somewhere to go.
  const models = await getChatModels(CHAT_MODELS)

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
    let lastError = ''
    // Free models get pulled from the free tier often (ling-3.0-flash-sante
    // went 404 "unavailable for free" in Oct 2026) and free providers are
    // congested most of the day. Walk the list instead of dying on one.
    for (const model of models) {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
          'x-title': 'Chanki',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          // Nemotron/apodex reason out loud by default and leak the scratchpad
          // into `content`. Ask for no reasoning so the reply is the answer.
          reasoning: { effort: 'none' },
        }),
      })
      // 402/401/403 are account problems — no other model will help.
      if (res.status === 401 || res.status === 402 || res.status === 403) {
        throw new ApiError(ENDPOINT, res.status)
      }
      if (!res.ok) {
        lastError = `model ${model} failed (${res.status})`
        continue
      }
      const parsed = ReplySchema.safeParse(await res.json())
      if (!parsed.success) {
        lastError = `model ${model} returned a malformed reply`
        continue
      }
      const text = parsed.data.choices[0].message.content.trim()
      if (!text) {
        // Reasoning models can burn the whole budget and return null.
        lastError = `model ${model} returned an empty reply`
        continue
      }
      return text
    }
    // Every model failed. 429 in the trail means provider congestion.
    throw new Error(/429/.test(lastError) ? 'all free models busy (429)' : lastError)
  } catch (err) {
    if (err instanceof ApiError) {
      // 429 is the free tier talking: daily cap spent, too many too fast,
      // or the free provider is congested. Quota line says which.
      if (err.status === 429) {
        throw new Error('free limit hit (429) — check the counter above, wait a bit, then Retry')
      }
      throw new Error(`assistant request failed (${err.status})`)
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(signal?.aborted ? 'assistant request cancelled' : 'assistant request timed out')
    }
    if (err instanceof Error && err.message.startsWith('all free models')) {
      // Congestion across the whole free pool — retry later, not a bug.
      throw new Error('free models busy (429) — wait a moment, then Retry')
    }
    if (err instanceof Error && err.message.startsWith('model ')) {
      throw new Error(`assistant unavailable — ${err.message}`)
    }
    if (err instanceof Error && err.message.startsWith('assistant ')) throw err
    // Network failure, JSON parse failure, schema mismatch.
    throw new Error('assistant unreachable — check your connection')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
