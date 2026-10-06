/**
 * Assistant chat thread — DEVICE-LOCAL, single-row, compact.
 *
 * Stored in the existing `meta` key/value table (no schema bump): the whole
 * thread is one JSON string of `[roleCode, text]` tuples — no per-message
 * documents, no repeated `role:` keys, nothing that leaves the device.
 * Personal by design, like the dictionary history: never synced to Firestore.
 */
import { db } from './db'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  text: string
}

const THREAD_KEY = 'chat.thread'
/** Cap keeps one row small; older turns drop off the end. */
export const MAX_STORED_MESSAGES = 120

/** `'u'`/`'a'` role codes — one char instead of full role strings. */
export function encodeThread(messages: ChatMessage[]): string {
  return JSON.stringify(
    messages.map((m) => [m.role === 'user' ? 'u' : 'a', m.text] as [string, string]),
  )
}

/** Tolerant decode: garbage, corrupt rows or foreign shapes → []. */
export function decodeThread(raw: unknown): ChatMessage[] {
  if (typeof raw !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: ChatMessage[] = []
    for (const item of parsed) {
      if (!Array.isArray(item) || item.length < 2) continue
      const [code, text] = item
      if ((code !== 'u' && code !== 'a') || typeof text !== 'string' || !text) continue
      out.push({ role: code === 'u' ? 'user' : 'assistant', text })
    }
    return out.slice(-MAX_STORED_MESSAGES)
  } catch {
    return []
  }
}

export function trimThread(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_STORED_MESSAGES)
}

export async function loadThread(): Promise<ChatMessage[]> {
  try {
    const row = await db.meta.get(THREAD_KEY)
    return decodeThread(row?.value)
  } catch {
    // Storage blocked — start empty rather than crash the screen.
    return []
  }
}

export async function saveThread(messages: ChatMessage[]): Promise<void> {
  try {
    await db.meta.put({ key: THREAD_KEY, value: encodeThread(trimThread(messages)) })
  } catch {
    // Convenience, not a contract — chat keeps working in memory.
  }
}

export async function clearThread(): Promise<void> {
  try {
    await db.meta.delete(THREAD_KEY)
  } catch {
    /* nothing to clear */
  }
}
