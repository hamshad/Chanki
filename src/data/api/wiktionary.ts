/**
 * English Wiktionary API — keyless, CORS-enabled dictionary for admin search.
 * Search (hanzi / pinyin / English) + definitions for Chinese words.
 */

const API = 'https://en.wiktionary.org'

export interface WikiSearchResult {
  title: string
  snippet: string
}

export interface WikiSense {
  pos: string
  definition: string
  example?: string
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Full-text search — works for hanzi, tone-marked pinyin and English. */
export async function searchWiktionary(query: string): Promise<WikiSearchResult[]> {
  const url =
    `${API}/w/api.php?action=query&list=search&format=json&origin=*&srlimit=8` +
    `&srsearch=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Wiktionary search failed (${res.status})`)
  const data = (await res.json()) as {
    query?: { search?: { title: string; snippet: string }[] }
  }
  return (data.query?.search ?? []).map(hit => ({
    title: hit.title,
    snippet: stripHtml(hit.snippet),
  }))
}

/** Definitions + usage examples for a Chinese word, zh senses only. */
export async function fetchWiktionaryDefinitions(word: string): Promise<WikiSense[]> {
  const res = await fetch(`${API}/api/rest_v1/page/definition/${encodeURIComponent(word)}`)
  if (!res.ok) throw new Error(`Wiktionary definition failed (${res.status})`)
  const data = (await res.json()) as Record<string, unknown>
  const zh = data.zh ?? data['zh-Hans'] ?? data['zh-Hant']
  if (!Array.isArray(zh)) return []

  const senses: WikiSense[] = []
  for (const part of zh) {
    const block = part as { partOfSpeech?: string; definitions?: unknown[] }
    for (const def of block.definitions ?? []) {
      const d = def as { definition?: string; parsedExamples?: { translation?: string }[] }
      if (!d.definition) continue
      const exampleHtml = d.parsedExamples?.[0]?.translation
      const example = exampleHtml ? stripHtml(exampleHtml).replace(/\[Pinyin\]\s*/gi, '') : undefined
      senses.push({
        pos: block.partOfSpeech ?? '',
        definition: stripHtml(d.definition),
        example: example && example.length > 4 ? example : undefined,
      })
    }
  }
  return senses
}

export function containsHanzi(text: string): boolean {
  return /[一-鿿]/.test(text)
}
