// Shared ETL helpers: disk-backed fetch cache, deterministic UUIDs,
// pinyin tone derivation, CC-CEDICT parsing, POS tag mapping.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const ROOT = path.resolve(__dirname, '../..')
export const CACHE_DIR = path.join(ROOT, '.cache/data')
export const DECK_DIR = path.join(ROOT, 'public/assets/deck')
export const HANZI_DATA_DIR = path.join(DECK_DIR, 'hanzi-data')
export const AUDIO_DIR = path.join(DECK_DIR, 'audio')
export const INDEX_DIR = path.join(DECK_DIR, 'index')

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function cacheFile(name) {
  ensureDir(CACHE_DIR)
  return path.join(CACHE_DIR, name)
}

export function readCache(name, { maxAgeMs = Infinity } = {}) {
  const file = cacheFile(name)
  if (!fs.existsSync(file)) return null
  const age = Date.now() - fs.statSync(file).mtimeMs
  if (age > maxAgeMs) return null
  return fs.readFileSync(file)
}

export function writeCache(name, data) {
  const file = cacheFile(name)
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, data)
  return file
}

export async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Fetch raw bytes with disk cache. Cache is keyed by name; pass refresh to bypass. */
export async function fetchBuffer(url, { cacheName, maxAgeMs = 7 * 24 * 3600 * 1000, refresh = false, headers = {} } = {}) {
  if (cacheName && !refresh) {
    const hit = readCache(cacheName, { maxAgeMs })
    if (hit) return hit
  }
  const res = await fetch(url, { headers: { 'user-agent': 'chanki-etl/1.0', ...headers } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (cacheName) writeCache(cacheName, buf)
  return buf
}

export async function fetchText(url, opts = {}) {
  return (await fetchBuffer(url, opts)).toString('utf8')
}

export async function fetchJSON(url, opts = {}) {
  return JSON.parse(await fetchText(url, opts))
}

/** Map endpoint JSON via disk cache (for APIs whose responses we want replayable). */
export async function fetchApiJSON(url, { cacheName, refresh = false, maxAgeMs = 30 * 24 * 3600 * 1000 } = {}) {
  if (!refresh) {
    const hit = readCache(cacheName, { maxAgeMs })
    if (hit) return JSON.parse(hit.toString('utf8'))
  }
  const res = await fetch(url, { headers: { 'user-agent': 'chanki-etl/1.0' } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  const text = await res.text()
  writeCache(cacheName, text)
  return JSON.parse(text)
}

/**
 * Deterministic UUID (v4-shaped) so regenerated cards keep stable ids and
 * existing learner progress is not orphaned.
 */
export function detUuid(namespace, name) {
  const h = createHash('sha256').update(`${namespace}|${name}`).digest('hex')
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-')
}

const MARKED_TONES = {
  ā: 1, ē: 1, ī: 1, ō: 1, ū: 1, ǖ: 1,
  á: 2, é: 2, í: 2, ó: 2, ú: 2, ǘ: 2,
  ǎ: 3, ě: 3, ǐ: 3, ǒ: 3, ǔ: 3, ǚ: 3,
  à: 4, è: 4, ì: 4, ò: 4, ù: 4, ǜ: 4,
}

/** Tone of first syllable of numeric pinyin ('ai4' -> '1'). Neutral/no-digit -> '5'. */
export function toneFromNumeric(numericPinyin) {
  if (!numericPinyin) return '5'
  const first = String(numericPinyin).trim().split(/\s+/)[0]
  const m = first.match(/([1-5])$/)
  return m ? m[1] : '5'
}

/** Tone of first syllable of tone-marked pinyin ('ài' -> '1'). Neutral -> '5'. */
export function toneFromMarked(markedPinyin) {
  if (!markedPinyin) return '5'
  const first = String(markedPinyin).trim().split(/\s+/)[0]
  for (const ch of first) {
    if (MARKED_TONES[ch]) return String(MARKED_TONES[ch])
  }
  return '5'
}

/** Numeric pinyin -> tone-marked pinyin. Handles ü (written u:) and neutral tone. */
export function numericToMarked(numeric) {
  const syllables = String(numeric).trim().split(/\s+/)
  return syllables
    .map((syl) => {
      const m = syl.match(/^(.+?)([1-5])$/)
      if (!m) return syl
      let [, core, tone] = m
      if (core.endsWith('u:') || core.endsWith('ü')) {
        core = core.replace(/u:$/, 'ü')
      }
      if (tone === '5') return core
      // vowel priority: a > e > ou last-diphthong > i/u/ü final
      const vowelRe = /(a)|(e)|([iuvü])([aoeiuü]*)$/
      const match = core.match(vowelRe)
      if (!match) return core
      const [, a, e, iu, tail] = match
      let target
      let idx
      if (a) {
        target = 'a'
        idx = core.indexOf('a')
      } else if (e) {
        target = 'e'
        idx = core.indexOf('e')
      } else if (iu) {
        // mark the last vowel of the final group
        const group = (iu || '') + (tail || '')
        const lastVowel = group[group.length - 1]
        idx = core.lastIndexOf(lastVowel)
        target = lastVowel
      }
      const marks = { 1: { a: 'ā', e: 'ē', i: 'ī', o: 'ō', u: 'ū', 'ü': 'ǖ' }, 2: { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', 'ü': 'ǘ' }, 3: { a: 'ǎ', e: 'ě', i: 'ǐ', o: 'ǒ', u: 'ǔ', 'ü': 'ǚ' }, 4: { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', 'ü': 'ǜ' } }
      const marked = marks[tone]?.[target]
      if (!marked || idx < 0) return core
      return core.slice(0, idx) + marked + core.slice(idx + 1)
    })
    .join(' ')
}

/**
 * Parse CC-CEDICT text into a Map keyed by simplified character/word.
 * Line format: 愛 爱 [ai4] /love/to love/ ...
 * Pinyin is bracketed and space-separated per syllable; may contain u: (ü).
 */
export function parseCedict(text) {
  const map = new Map()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(\S+)\s+(\S+)\s+(.+?)\s+(\/.+)$/)
    if (!m) continue
    const [, traditional, simplified, pinyinRaw, rest] = m
    const pinyin = pinyinRaw
      .replace(/^\[|\]$/g, '')
      .replace(/u:/g, 'ü')
      .trim()
    const definitions = rest
      .split('/')
      .slice(1)
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => d.replace(/u:/g, 'ü'))
    if (!pinyin || !definitions.length) continue
    const entry = { traditional, simplified, pinyin, definitions }
    const existing = map.get(simplified)
    if (existing) existing.push(entry)
    else map.set(simplified, [entry])
  }
  return map
}

/** Minimal RFC4180 CSV parser (handles quoted fields incl. embedded commas/quotes/newlines). */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// HSK 3.0 word-class codes (ivankra/hsk30) → human-readable tags.
const HSK30_POS = {
  N: 'noun', V: 'verb', Adj: 'adjective', Adv: 'adverb', Pron: 'pronoun',
  Num: 'number', M: 'measure-word', Aux: 'auxiliary', Prep: 'preposition',
  Conj: 'conjunction', Intj: 'interjection', Suffix: 'suffix', Prefix: 'prefix',
  Phonetic: 'phonetic',
}

// Dictionary POS codes (complete-hsk-vocabulary / modern Chinese corpus tags).
const DICT_POS = {
  v: 'verb', vn: 'verb', n: 'noun', a: 'adjective', an: 'adjective', ad: 'adjective',
  d: 'adverb', b: 'adjective', c: 'conjunction', f: 'direction', g: 'morpheme',
  i: 'idiom', l: 'idiom', m: 'number', nr: 'name', ns: 'place', nt: 'organization',
  nz: 'proper-noun', o: 'onomatopoeia', e: 'onomatopoeia', p: 'preposition',
  q: 'measure-word', r: 'pronoun', s: 'place', t: 'time', u: 'particle',
  y: 'particle', z: 'adjective', k: 'suffix', h: 'prefix', j: 'abbreviation',
  wx: 'non-lexical', Mg: 'morpheme', qt: 'quantity', qv: 'measure-word', mq: 'measure-word',
  tg: 'time', cc: 'conjunction',
}

/** Map raw POS codes (HSK30 uppercase or dictionary lowercase) to readable tags. */
export function mapPosTags(codes) {
  const tags = []
  for (const raw of codes) {
    const code = String(raw).trim()
    if (!code) continue
    const tag = HSK30_POS[code] || DICT_POS[code] || DICT_POS[code.toLowerCase()] || code.toLowerCase()
    if (!tags.includes(tag)) tags.push(tag)
  }
  return tags
}

/** Simple bounded-concurrency runner for polite API crawling. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}
