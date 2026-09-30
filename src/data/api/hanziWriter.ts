// Stroke-order data loader for hanzi-writer.
// Local bundled asset first (offline), jsDelivr CDN as fallback.

import * as z from 'zod'

export const CharDataSchema = z.object({
  strokes: z.array(z.string()),
  medians: z.array(z.array(z.array(z.number()))),
  radStrokes: z.array(z.number()).optional(),
})

export type CharData = z.infer<typeof CharDataSchema>

const CDN = (char: string) =>
  `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`

const cache = new Map<string, Promise<CharData | null>>()

/**
 * Load stroke data for a character. Tries bundled `/assets/deck/hanzi-data/`
 * then the CDN. Returns null when neither source has the character.
 */
export function loadCharData(char: string): Promise<CharData | null> {
  const existing = cache.get(char)
  if (existing) return existing

  const promise = (async () => {
    for (const url of [`/assets/deck/hanzi-data/${encodeURIComponent(char)}.json`, CDN(char)]) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const parsed = CharDataSchema.safeParse(await res.json())
        if (parsed.success) return parsed.data
      } catch {
        /* try next source */
      }
    }
    return null
  })()

  cache.set(char, promise)
  return promise
}
