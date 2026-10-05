/**
 * Dictionary search history — DEVICE-LOCAL ONLY.
 *
 * Deliberately stored in `localStorage` and never synced: what someone
 * looked up is personal, so it stays on the device that looked it up.
 * No Firestore write, no RTDB write, nothing that leaves the machine.
 */

const STORAGE_KEY = 'chanki.dict.history'
/** Long enough to skip keystroke fragments ("n", "ni", "nih…"). */
export const HISTORY_DEBOUNCE_MS = 800
const MAX_ENTRIES = 12

export function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((q): q is string => typeof q === 'string' && q.length > 0).slice(0, MAX_ENTRIES)
  } catch {
    // Private-mode or corrupt value — no history beats a crash.
    return []
  }
}

/** Prepend `query`, dedupe, cap, persist. Returns the new list. */
export function pushHistory(query: string): string[] {
  const q = query.trim()
  if (!q) return loadHistory()
  const next = [q, ...loadHistory().filter((entry) => entry !== q)].slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full/blocked — history is a convenience, not a contract.
  }
  return next
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to clear */
  }
}
