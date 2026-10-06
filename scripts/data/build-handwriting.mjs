/**
 * Handwriting recognition index for the Dictionary draw pad.
 *
 * Bundles stroke medians (hanzi-writer-data) for every character in the HSK
 * char set (chars.json, ~2.6k) into ONE fetchable file:
 * `public/assets/deck/index/handwriting.json`.
 *
 * Each entry is `{s: strokes, f: frequency0to1}` — frequency is the tie
 * breaker that surfaces common characters when shapes score alike.
 *
 * Rationale: the draw pad needs thousands of candidates to suggest from
 * while the user writes, but fetching per-character JSONs at runtime would
 * be thousands of requests. One ~1 MB file, lazily loaded and runtime-cached
 * by the service worker (index/ is excluded from precache by policy), beats
 * both. Raw downloads live in .cache/ — NOT public/ — so the install
 * precache stays lean.
 *
 * Run: npm run data:handwriting
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const CHARS_JSON = join(root, 'public/assets/deck/index/chars.json')
const CEDICT_JSON = join(root, 'public/assets/deck/index/cedict-hsk.json')
const DECK_HANZI_DIR = join(root, 'public/assets/deck/hanzi-data') // already local for deck chars
const CACHE_DIR = join(root, '.cache/hanzi-writer')
const OUT = join(root, 'public/assets/deck/index/handwriting.json')

const CDN = (char) =>
  `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`
const CONCURRENCY = 8

function loadLocal(char) {
  // Deck characters already ship with the app — reuse, never re-fetch.
  const file = join(DECK_HANZI_DIR, `${char}.json`)
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  const cached = join(CACHE_DIR, `${char}.json`)
  if (fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, 'utf8'))
  return null
}

async function fetchChar(char) {
  try {
    const res = await fetch(CDN(char))
    if (!res.ok) return null
    const text = await res.text()
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(join(CACHE_DIR, `${char}.json`), text)
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Medians → flat integer point lists: strokes of [x,y,x,y,…] in 0–1024 space.
 *
 * hanzi-writer-data is stored y-UP (the library renders with scale(1,-1)),
 * but drawings arrive y-DOWN from the canvas. Flip here so the index lives
 * in the same orientation as user input — otherwise every template is
 * matched upside down.
 */
function compact(medians) {
  return medians.map((stroke) => {
    const flat = []
    for (const [x, y] of stroke) {
      flat.push(Math.round(x), Math.round(1024 - y))
    }
    return flat
  })
}

/**
 * Per-character frequency in 0..1 (1 = commonest), aggregated from the
 * word-frequency ranks in the CEDICT index. Recognition uses it as a tie
 * breaker: when two shapes score alike, surface the char people actually write.
 */
function charFrequency(chars) {
  const cedict = JSON.parse(fs.readFileSync(CEDICT_JSON, 'utf8'))
  const score = new Map()
  for (const [word, entry] of Object.entries(cedict)) {
    const rank = typeof entry?.f === 'number' ? entry.f : 60000
    const weight = 1 / (rank + 100)
    for (const ch of new Set(word)) {
      if (!/^[一-鿿]$/.test(ch)) continue
      score.set(ch, (score.get(ch) ?? 0) + weight)
    }
  }
  const ranked = chars.filter((c) => score.has(c)).sort((a, b) => score.get(b) - score.get(a))
  const norm = new Map()
  ranked.forEach((c, i) => {
    norm.set(c, ranked.length > 1 ? 1 - i / (ranked.length - 1) : 1)
  })
  return norm
}

async function run() {
  const chars = Object.keys(JSON.parse(fs.readFileSync(CHARS_JSON, 'utf8'))).filter((c) =>
    /^[一-鿿]$/.test(c),
  )
  console.log(`handwriting index: ${chars.length} characters`)

  const freq = charFrequency(chars)
  const index = {}
  let ok = 0
  let skip = 0

  for (let i = 0; i < chars.length; i += CONCURRENCY) {
    const batch = chars.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (char) => {
        const data = loadLocal(char) ?? (await fetchChar(char))
        return { char, medians: data?.medians?.length ? data.medians : null }
      }),
    )
    for (const { char, medians } of results) {
      if (!medians) {
        skip++
        continue
      }
      index[char] = {
        s: compact(medians),
        f: Math.round((freq.get(char) ?? 0) * 1000) / 1000,
      }
      ok++
    }
    if ((i + CONCURRENCY) % 400 < CONCURRENCY) {
      console.log(`  ${Math.min(i + CONCURRENCY, chars.length)}/${chars.length}`)
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(index))
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0)
  console.log(`written ${ok} chars, skipped ${skip} → ${path.relative(root, OUT)} (${kb} KB)`)
}

run()
