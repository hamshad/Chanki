// Open-source data loaders. Every loader is disk-cached under .cache/data/
// so rebuilds are fast and offline-capable. Source URLs + licenses are
// mirrored in public/assets/deck/SOURCES.md.
import fs from 'node:fs'
import zlib from 'node:zlib'
import {
  CACHE_DIR, HANZI_DATA_DIR, AUDIO_DIR, ensureDir,
  fetchText, fetchJSON, fetchApiJSON, fetchBuffer, parseCsv, parseCedict, sleep,
} from './lib.mjs'

// ─── HSK 3.0 official word lists (ivankra/hsk30: level, POS, traditional, pinyin) ─

const HSK30_CSV_URL = 'https://raw.githubusercontent.com/ivankra/hsk30/master/hsk30.csv'

/** Rows keyed by simplified word. Compound rows ("妈妈|妈") expand per alternative. */
export async function loadHsk30({ refresh = false } = {}) {
  const text = await fetchText(HSK30_CSV_URL, { cacheName: 'hsk30.csv', refresh })
  const rows = parseCsv(text)
  const header = rows[0]
  const idx = Object.fromEntries(header.map((h, i) => [h, i]))
  const byWord = new Map()
  for (const row of rows.slice(1)) {
    const get = (name) => row[idx[name]] ?? ''
    const simples = get('Simplified').split('|')
    const trads = get('Traditional').split('|')
    const pinyins = get('Pinyin').split('|')
    const posField = get('POS')
    const poss = posField.includes('|') ? posField.split('|') : simples.map(() => posField)
    const level = parseInt(get('Level'), 10)
    simples.forEach((simp, i) => {
      if (!simp) return
      if (byWord.has(simp)) return // keep first (lowest-listed) row
      byWord.set(simp, {
        word: simp,
        traditional: trads[i] || trads[0] || '',
        pinyin: pinyins[i] || pinyins[0] || '',
        level: Number.isFinite(level) ? level : undefined,
        posCodes: (poss[i] || poss[0] || '').split('/').filter(Boolean),
        source: 'hsk30',
      })
    })
  }
  return byWord
}

// ─── Complete HSK 2.0 vocabulary (drkameleon: radical, frequency, meanings, POS) ─

const HSK_URL = (type, level) =>
  `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/master/wordlists/inclusive/${type}/${level}.json`

/**
 * Returns { byWord, levelByWord } across the requested HSK system levels.
 * Inclusive lists are cumulative, so level = first level where the word appears.
 */
export async function loadHskWords({ levels = [1, 2, 3, 4, 5, 6], type = 'old', refresh = false } = {}) {
  const byWord = new Map()
  const levelByWord = new Map()
  for (const level of levels) {
    const data = await fetchJSON(HSK_URL(type, level), {
      cacheName: `hsk-${type}-${level}.json`,
      refresh,
    })
    for (const entry of data) {
      if (!byWord.has(entry.simplified)) {
        byWord.set(entry.simplified, entry)
        levelByWord.set(entry.simplified, level)
      }
    }
  }
  return { byWord, levelByWord }
}

// ─── zh-50K word frequency (wordfreq-derived; zaum mirror) ────────────────────

const ZH50K_URL =
  'https://raw.githubusercontent.com/zacharydenton/zaum/master/public/data/wordfreq/zh/zh_50K.txt'

/**
 * Top 50k Mandarin words by frequency, `{ rank, count }` (1 = commonest).
 * Disk-cached; used to widen the runtime dictionary index beyond HSK lists
 * (they miss common words like 你好) and to give every entry a frequency.
 */
export async function loadWordfreq({ refresh = false } = {}) {
  const text = await fetchText(ZH50K_URL, { cacheName: 'zh-50k.txt', refresh })
  const map = new Map()
  let rank = 0
  for (const line of text.split('\n')) {
    const i = line.lastIndexOf(' ')
    if (i < 1) continue
    const word = line.slice(0, i).trim()
    const count = Number(line.slice(i + 1))
    if (!word || !Number.isFinite(count)) continue
    rank++
    if (!map.has(word)) map.set(word, { rank, count })
  }
  return map
}

// ─── CC-CEDICT (MDBG) ───────────────────────────────────────────────────────────

const CEDICT_URL = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz'

export async function loadCedict({ refresh = false } = {}) {
  const gz = await fetchBuffer(CEDICT_URL, { cacheName: 'cedict.txt.gz', refresh })
  return parseCedict(zlib.gunzipSync(gz).toString('utf8'))
}

// ─── Make Me A Hanzi (radical, decomposition, etymology, learner gloss) ────────

const MAMH_DICTIONARY_URL =
  'https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt'

export async function loadMakemeahanzi({ refresh = false } = {}) {
  const text = await fetchText(MAMH_DICTIONARY_URL, { cacheName: 'makemeahanzi-dictionary.txt', refresh })
  const map = new Map()
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      map.set(entry.character, entry)
    } catch {
      // skip malformed lines — data source contains occasional noise
    }
  }
  return map
}

// ─── hanzi-writer-data (stroke graphics; stroke count = strokes.length) ────────

const HANZI_WRITER_DATA = (char) =>
  `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(char)}.json`

/**
 * Download per-character stroke JSON into public/assets/deck/hanzi-data/
 * (same location the app fetches from). Returns parsed data or null.
 */
export async function loadStrokeData(char, { refresh = false } = {}) {
  const file = `${HANZI_DATA_DIR}/${char}.json`
  if (!refresh && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  try {
    const text = await fetchText(HANZI_WRITER_DATA(char), {
      cacheName: `hanzi-writer/${char}.json`,
      refresh,
    })
    ensureDir(HANZI_DATA_DIR)
    fs.writeFileSync(file, text)
    return JSON.parse(text)
  } catch (err) {
    console.warn(`  stroke data missing for ${char}: ${err.message}`)
    return null
  }
}

/**
 * Stroke count only (hanzi-writer-data) — cached under .cache/data/, does NOT
 * write into public/. Used by the admin chars index.
 */
export async function loadStrokeCount(char, { refresh = false } = {}) {
  try {
    const text = await fetchText(HANZI_WRITER_DATA(char), {
      cacheName: `hanzi-writer/${char}.json`,
      refresh,
    })
    const data = JSON.parse(text)
    return Array.isArray(data.strokes) ? data.strokes.length : undefined
  } catch {
    return undefined
  }
}

// ─── Tatoeba (example sentences + native speaker audio) ────────────────────────

const TATOEBA_API = 'https://api.tatoeba.org'

async function tatoebaGet(pathAndQuery, cacheName, { refresh = false } = {}) {
  // polite crawl: bounded rate regardless of cache state
  await sleep(120)
  return fetchApiJSON(`${TATOEBA_API}${pathAndQuery}`, { cacheName, refresh })
}

/**
 * Search example sentences containing `word` (cmn → eng translations).
 * Returns at most `limit` candidates: { id, zh, en, script, hasAudio }
 */
export async function tatoebaExamples(word, { limit = 10, refresh = false } = {}) {
  const q = encodeURIComponent(word)
  const url = `/v1/sentences?lang=cmn&q=${q}&sort=relevance&trans:lang=eng&include=audios&limit=${limit}`
  try {
    const data = await tatoebaGet(url, `tatoeba/sent-${word}.json`, { refresh })
    return (data.data || []).map((s) => {
      const audio = (s.audios || [])[0]
      return {
        id: s.id,
        zh: s.text,
        script: s.script,
        en: (s.translations || [])
          .flatMap((group) => (Array.isArray(group) ? group : [group]))
          .find((t) => t.lang === 'eng')?.text,
        // Tatoeba rejects downloads for unlicensed recordings (403), so only
        // expose audio the author has actually licensed for reuse.
        // NOTE: download_url ships a stale singular path (/v1/audio/); the live
        // endpoint is /v1/audios/{id}/file.
        audioUrl: audio?.license ? `${TATOEBA_API}/v1/audios/${audio.id}/file` : null,
        audioLicense: audio?.license || null,
        audioId: audio?.id ?? null,
      }
    })
  } catch (err) {
    if (String(err.message).includes('-> 404')) return []
    throw err
  }
}

/**
 * Find a native-speaker recording whose sentence text equals `word` exactly
 * (trailing punctuation tolerated). Returns absolute URL + attribution or null.
 */
export async function tatoebaWordAudio(word, { refresh = false } = {}) {
  const q = encodeURIComponent(word)
  try {
    const data = await tatoebaGet(`/unstable/audios?lang=cmn&text=${q}&limit=100`, `tatoeba/audio-${word}.json`, { refresh })
    const strip = (s) => String(s || '').replace(/[。，！？、…,.!?]+$/u, '')
    const exact = (data.data || []).find((a) => strip(a.sentence?.text) === word)
    if (!exact) return null
    if (!exact.license) return null // reuse not permitted → runtime TTS fallback
    const url = exact.download_url.startsWith('http')
      ? exact.download_url
      : `${TATOEBA_API}${exact.download_url}`
    return {
      url,
      id: exact.id,
      author: exact.author,
      license: exact.license || 'CC BY 2.0 FR',
      attributionUrl: exact.attribution_url,
    }
  } catch (err) {
    if (String(err.message).includes('-> 404')) return null
    throw err
  }
}

/** Download an audio file into public/assets/deck/audio/ with a flat safe name. */
export async function downloadAudio(url, fileName, { refresh = false } = {}) {
  const file = `${AUDIO_DIR}/${fileName}`
  if (!refresh && fs.existsSync(file)) return `/assets/deck/audio/${fileName}`
  const buf = await fetchBuffer(url, { cacheName: null, refresh, headers: { referer: `${TATOEBA_API}/` } })
  ensureDir(AUDIO_DIR)
  fs.writeFileSync(file, buf)
  return `/assets/deck/audio/${fileName}`
}

export { CACHE_DIR }
