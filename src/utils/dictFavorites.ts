/**
 * Dictionary favourites — DEVICE-LOCAL ONLY.
 *
 * Same contract as search history: starred words stay in `localStorage`
 * and are never synced. A favourite is the entry's hanzi key, resolved
 * through `searchDict` at render time like history entries.
 */

const STORAGE_KEY = 'chanki.dict.favorites'
const MAX_FAVORITES = 50

export function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((q): q is string => typeof q === 'string' && q.length > 0)
      .slice(0, MAX_FAVORITES)
  } catch {
    // Private-mode or corrupt value — no favourites beats a crash.
    return []
  }
}

/**
 * Star `hanzi`, or unstar it when already starred. Starring anew puts the
 * entry back at the front. Returns the new list.
 */
export function toggleFavorite(hanzi: string): string[] {
  const key = hanzi.trim()
  if (!key) return loadFavorites()
  const current = loadFavorites()
  const next = (
    current.includes(key) ? current.filter((entry) => entry !== key) : [key, ...current]
  ).slice(0, MAX_FAVORITES)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full/blocked — favourites are a convenience, not a contract.
  }
  return next
}
