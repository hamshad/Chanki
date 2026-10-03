/**
 * Ranked admin dictionary search over the build-time index
 * (`/assets/deck/index/cedict-hsk.json` — CC-CEDICT senses joined with HSK
 * levels, POS tags and zh-50k frequency; built by `npm run data:build`).
 *
 * Noise control vs the old loop: every hit is Chinese (no English Wiktionary
 * titles), matching is tiered (exact > pinyin > prefix > meaning > substring)
 * and ranking happens BEFORE truncation, not mid-scan.
 */

import type { CharMeta, CardExample } from '../schema'
import { toneFromMarked } from '../../utils/pinyin'

export interface DictEntry {
  /** traditional */
  t?: string
  /** tone-marked pinyin */
  p: string
  /** English senses */
  m: string[]
  /** HSK level */
  l?: number
  /** frequency rank, lower = commoner */
  f?: number
  /** POS tags */
  g?: string[]
}

export type MatchKind = 'hanzi' | 'traditional' | 'pinyin' | 'prefix' | 'contains' | 'meaning'

export interface WordHit {
  hanzi: string
  traditional?: string
  pinyin: string
  meaning: string
  tone: '1' | '2' | '3' | '4' | '5'
  hsk?: number
  freq?: number
  tags: string[]
  match: MatchKind
}

/** Radical / strokes / decomposition / etymology for one character. */
export interface CharSeed {
  /** radical */
  r?: string
  /** stroke count */
  s?: number
  /** IDS decomposition */
  d?: string
  /** etymology */
  e?: { type: string; hint?: string; phonetic?: string; semantic?: string }
}

const CJK = /[一-鿿]/

export function containsHanzi(text: string): boolean {
  return CJK.test(text)
}

/** Lowercase, tone marks/numbers stripped, spaces removed: 'Nǐ Hǎo3' → 'nihao'. */
export function normalizePinyin(p: string): string {
  return p
    .toLowerCase()
    .replace(/ü/g, 'v') // CC-CEDICT numeric convention: lüè → lve
    .replace(/[1-5]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
}

function isPinyinShape(q: string): boolean {
  // Any letters/digits/spaces — tone-marked latin (nǐ) must qualify; hanzi
  // queries are routed before this, and the normQ guard below stops
  // digit-only queries ('123') from prefix-matching every entry.
  return /^[\p{L}\d\s]+$/u.test(q)
}

const MATCH_RANK: Record<MatchKind, number> = {
  hanzi: 0,
  traditional: 1,
  pinyin: 2,
  prefix: 3,
  contains: 4,
  meaning: 5,
}

/**
 * Tiered search: exact hanzi → exact traditional → exact pinyin →
 * hanzi prefix → pinyin prefix → meaning/substring. Sorts everything,
 * THEN truncates — no arbitrary mid-loop cutoff.
 */
export function searchDict(
  index: Record<string, DictEntry>,
  rawQuery: string,
  limit = 20,
): WordHit[] {
  const q = rawQuery.trim()
  if (!q) return []
  const qLower = q.toLowerCase()
  const hanziQuery = containsHanzi(q)
  const normQ = isPinyinShape(q) ? normalizePinyin(q) : ''
  const pinyinQuery = !hanziQuery && normQ.length > 0

  const hits: (WordHit & { tier: number; len: number; freqRank: number; hskRank: number })[] = []

  for (const [hanzi, entry] of Object.entries(index)) {
    if (!entry?.p || !entry.m?.length) continue
    const normP = normalizePinyin(entry.p)

    let match: MatchKind | null = null
    if (hanziQuery) {
      if (hanzi === q) match = 'hanzi'
      else if (entry.t === q) match = 'traditional'
      else if (hanzi.startsWith(q)) match = 'prefix'
      else if (hanzi.includes(q)) match = 'contains' // embedded-char scan
    } else if (pinyinQuery) {
      if (normP === normQ) match = 'pinyin'
      else if (normP.startsWith(normQ)) match = 'prefix'
    }
    if (!match && q.length >= 2 && entry.m.some(s => s.toLowerCase().includes(qLower))) {
      match = 'meaning'
    }
    if (!match) continue

    hits.push({
      hanzi,
      traditional: entry.t && entry.t !== hanzi ? entry.t : undefined,
      pinyin: entry.p,
      meaning: entry.m.join('; '),
      tone: toneFromMarked(entry.p),
      hsk: entry.l,
      freq: entry.f,
      tags: entry.g ?? [],
      match,
      tier: MATCH_RANK[match],
      len: [...hanzi].length,
      freqRank: entry.f ?? Number.MAX_SAFE_INTEGER,
      hskRank: entry.l ?? 9,
    })
  }

  hits.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (a.len !== b.len) return a.len - b.len
    if (a.freqRank !== b.freqRank) return a.freqRank - b.freqRank
    if (a.hskRank !== b.hskRank) return a.hskRank - b.hskRank
    return a.hanzi.localeCompare(b.hanzi)
  })

  return hits
    .slice(0, limit)
    .map(({ tier: _t, len: _l, freqRank: _f, hskRank: _h, ...hit }) => hit)
}

// ─── Lazy index loaders (admin-only; runtime-cached by the service worker) ────

let dictPromise: Promise<Record<string, DictEntry>> | null = null
let charsPromise: Promise<Record<string, CharSeed>> | null = null

export function loadDict(): Promise<Record<string, DictEntry>> {
  dictPromise ??= fetch('/assets/deck/index/cedict-hsk.json').then(res => {
    if (!res.ok) throw new Error(`dictionary index unavailable (${res.status})`)
    return res.json() as Promise<Record<string, DictEntry>>
  })
  dictPromise.catch(() => {
    dictPromise = null
  })
  return dictPromise
}

export function loadChars(): Promise<Record<string, CharSeed>> {
  charsPromise ??= fetch('/assets/deck/index/chars.json').then(res => {
    if (!res.ok) throw new Error(`chars index unavailable (${res.status})`)
    return res.json() as Promise<Record<string, CharSeed>>
  })
  charsPromise.catch(() => {
    charsPromise = null
  })
  return charsPromise
}

/** `CharMeta[]` for a word — radical, strokes, decomposition, etymology. */
export async function charsForWord(hanzi: string): Promise<CharMeta[]> {
  const index = await loadChars()
  const out: CharMeta[] = []
  for (const char of [...new Set([...hanzi].filter(c => CJK.test(c)))]) {
    const seed = index[char]
    if (!seed) continue
    const meta: CharMeta = { char }
    if (seed.r) meta.radical = seed.r
    if (typeof seed.s === 'number') meta.strokes = seed.s
    if (seed.d) meta.decomposition = seed.d
    if (seed.e && ['ideographic', 'pictographic', 'pictophonetic'].includes(seed.e.type)) {
      meta.etymology = {
        type: seed.e.type as 'ideographic' | 'pictographic' | 'pictophonetic',
        ...(seed.e.hint ? { hint: seed.e.hint } : {}),
        ...(seed.e.phonetic ? { phonetic: seed.e.phonetic } : {}),
        ...(seed.e.semantic ? { semantic: seed.e.semantic } : {}),
      }
    }
    out.push(meta)
  }
  return out
}

/**
 * Filter + rank live Tatoeba hits for the card template (same quality bar
 * the seed ETL uses): contains the word, short, Mandarin script, audio first.
 */
export function pickExamples<T extends { zh: string; en?: string; script?: string | null }>(
  word: string,
  candidates: T[],
  max = 3,
): T[] {
  return candidates
    .filter(c => c.zh.includes(word) && c.zh.length <= 30 && c.script !== 'Hant')
    .sort((a, b) => a.zh.length - b.zh.length)
    .slice(0, max)
}

export type { CardExample }
