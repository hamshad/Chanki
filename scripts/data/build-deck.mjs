#!/usr/bin/env node
// Build-time ETL: generates public/assets/deck/hsk1-starter.json from open sources.
//
//   npm run data:build
//
// Inputs (all open-licensed, cached in .cache/data/):
//   scripts/data/deck-spec.json   — deck identity + word list (config)
//   ivankra/hsk30                 — HSK level, POS, traditional, pinyin
//   drkameleon/complete-hsk-vocab — frequency, radical backup, learner meanings
//   CC-CEDICT (MDBG)              — English definitions
//   makemeahanzi                  — radical, decomposition, etymology
//   hanzi-writer-data             — stroke graphics + stroke count
//   Tatoeba API                   — example sentences + native audio
//
// Output:
//   public/assets/deck/hsk1-starter.json  — {deck, cards} (seed contract)
//   public/assets/deck/hanzi-data/*.json  — stroke data (WritingPad)
//   public/assets/deck/audio/*.mp3        — native recordings (when available)
//   public/assets/deck/index/cedict-hsk.json — runtime dictionary search index
//   public/assets/deck/SOURCES.md          — attribution (license compliance)
import fs from 'node:fs'
import path from 'node:path'
import {
  ROOT, DECK_DIR, INDEX_DIR, ensureDir,
  detUuid, toneFromNumeric, toneFromMarked, numericToMarked, mapPosTags, mapLimit,
} from './lib.mjs'
import {
  loadHsk30, loadHskWords, loadCedict, loadMakemeahanzi, loadWordfreq,
  loadStrokeData, loadStrokeCount, tatoebaExamples, tatoebaWordAudio, downloadAudio,
} from './sources.mjs'

const CJK = /[\u4e00-\u9fa5]/

async function main() {
  const refresh = process.argv.includes('--refresh')
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/deck-spec.json'), 'utf8'))

  console.log('ETL ▸ loading sources …')
  const [hsk30, hskWords, cedict, mamh, wordfreq] = await Promise.all([
    loadHsk30({ refresh }),
    loadHskWords({ refresh }),
    loadCedict({ refresh }),
    loadMakemeahanzi({ refresh }),
    loadWordfreq({ refresh }),
  ])
  console.log(`  hsk30: ${hsk30.size} words | hsk2.0: ${hskWords.byWord.size} words | zh-50k: ${wordfreq.size}`)
  console.log(`  cedict: ${cedict.size} entries | makemeahanzi: ${mamh.size} chars`)

  // ── Resolve word list: explicit (spec.words) or top-frequency selection ──
  let wordList
  if (Array.isArray(spec.words) && spec.words.length) {
    wordList = spec.words.map((w) => ({ id: w.id, hanzi: w.hanzi }))
  } else if (spec.select) {
    const { levels, wordCount, orderBy = 'frequency' } = spec.select
    const pool = [...hskWords.levelByWord.entries()]
      .filter(([, lvl]) => levels.includes(lvl))
      .map(([word]) => {
        const entry = hskWords.byWord.get(word)
        return { hanzi: word, frequency: entry?.frequency ?? Number.MAX_SAFE_INTEGER }
      })
    if (orderBy === 'frequency') pool.sort((a, b) => a.frequency - b.frequency)
    wordList = pool.slice(0, wordCount).map((w) => ({
      id: detUuid(spec.deck.id, w.hanzi),
      hanzi: w.hanzi,
    }))
  } else {
    throw new Error('deck-spec.json needs `words` or `select`')
  }
  console.log(`ETL ▸ building ${spec.deck.name}: ${wordList.length} words`)

  // ── Per-word assembly (dictionary fields; no network) ──
  const cards = wordList.map(({ id, hanzi }) => buildCard(hanzi, id, spec.deck.id, hsk30, hskWords, cedict))

  // ── Stroke data for every unique character ──
  const chars = new Set()
  for (const card of cards) for (const ch of card.hanzi) if (CJK.test(ch)) chars.add(ch)
  console.log(`ETL ▸ stroke data: ${chars.size} unique chars`)
  const strokeData = new Map()
  await mapLimit([...chars], 6, async (ch) => {
    const data = await loadStrokeData(ch, { refresh })
    if (data) strokeData.set(ch, data)
  })

  // Attach per-character metadata (radical, strokes, decomposition, etymology)
  for (const card of cards) {
    card.chars = [...new Set([...card.hanzi].filter((c) => CJK.test(c)))].map((ch) => {
      const dict = mamh.get(ch)
      const strokes = strokeData.get(ch)
      const meta = { char: ch }
      if (dict?.radical) meta.radical = dict.radical
      if (strokes) meta.strokes = strokes.strokes.length
      if (dict?.decomposition && !dict.decomposition.startsWith('？')) meta.decomposition = dict.decomposition
      if (dict?.etymology) meta.etymology = dict.etymology
      return meta
    })
  }

  // ── Tatoeba: example sentences + native audio ──
  console.log('ETL ▸ Tatoeba examples + audio (network, cached) …')
  await mapLimit(cards, 4, async (card) => {
    const candidates = await tatoebaExamples(card.hanzi)
    const usable = candidates
      .filter((c) => c.zh && c.zh.includes(card.hanzi) && c.zh.length <= 30 && c.script !== 'Hant')
      .sort((a, b) => {
        // native recording first, then shorter sentences
        const audioDelta = (b.audioUrl ? 1 : 0) - (a.audioUrl ? 1 : 0)
        return audioDelta || a.zh.length - b.zh.length
      })
    const chosen = usable.slice(0, 2)
    if (chosen.length) {
      card.examples = []
      for (const ex of chosen) {
        const example = { zh: ex.zh.trim() }
        if (ex.en) example.en = ex.en.trim()
        if (ex.id) example.sourceId = ex.id
        if (ex.audioUrl) {
          try {
            example.audioUrl = await downloadAudio(ex.audioUrl, `ex-${ex.id}.mp3`)
          } catch {
            /* audio optional — keep sentence without it */
          }
        }
        card.examples.push(example)
      }
      card.example = card.examples[0].zh
    }

    try {
      const audio = await tatoebaWordAudio(card.hanzi)
      if (audio) {
        const safe = card.hanzi.length <= 4 ? card.hanzi : `w-${card.id.slice(0, 8)}`
        card.audioUrl = await downloadAudio(audio.url, `${safe}.mp3`)
      }
    } catch {
      /* no exact native recording → speechSynthesis fallback at runtime */
    }
  })

  // Strip undefined so JSON stays clean + strict-schema friendly
  const cleanCards = cards.map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)))

  const now = Date.now()
  const deck = {
    ...spec.deck,
    schemaVersion: 1,
    createdAt: spec.deck.createdAt || now,
    updatedAt: now,
  }

  // ── Runtime dictionary index (all HSK 1–6 words + CEDICT definitions) ──
  // Fields: t=traditional p=pinyin m=meanings l=HSK level f=frequency g=POS tags
  console.log('ETL ▸ runtime dictionary index …')
  ensureDir(INDEX_DIR)
  // Word set: HSK 1–6 lists ∪ deck words ∪ zh-50k top 20k (frequency).
  // The HSK lists alone miss everyday words like 你好 — the frequency
  // corpus closes that gap; cedict join decides final membership.
  const ZH50K_TOP = 20_000
  const wordSet = new Set([...hsk30.keys(), ...hskWords.byWord.keys(), ...wordList.map((w) => w.hanzi)])
  let taken = 0
  for (const [word] of wordfreq) {
    if (taken >= ZH50K_TOP) break
    wordSet.add(word)
    taken++
  }
  const index = {}
  for (const word of wordSet) {
    const entries = cedict.get(word)
    if (!entries?.length) continue
    const primary = entries[0]
    const meanings = entries.flatMap((e) => e.definitions)
    const h = hsk30.get(word)
    const d = hskWords.byWord.get(word)
    const level = h?.level ?? hskWords.levelByWord.get(word) ?? undefined
    const posCodes = h?.posCodes?.length ? h.posCodes : d?.pos || []
    const freq = d?.frequency ?? wordfreq.get(word)?.rank
    index[word] = {
      t: primary.traditional,
      p: primary.pinyin.match(/[1-5]\s*$/) ? numericToMarked(primary.pinyin) : primary.pinyin,
      m: [...new Set(meanings)].slice(0, 8),
      ...(level != null ? { l: level } : {}),
      ...(freq ? { f: freq } : {}),
      ...(mapPosTags(posCodes).length ? { g: mapPosTags(posCodes) } : {}),
    }
  }
  fs.writeFileSync(path.join(INDEX_DIR, 'cedict-hsk.json'), JSON.stringify(index))
  console.log(`  index: ${Object.keys(index).length} entries (${(fs.statSync(path.join(INDEX_DIR, 'cedict-hsk.json')).size / 1024).toFixed(0)} KB)`)

  // ── Per-character enrichment index (admin pick → Card.chars[]) ──
  // Radical / strokes / decomposition / etymology for every char across HSK
  // vocabulary. Lazy-fetched by the admin UI — never blocks deck builds.
  console.log('ETL ▸ chars index (radical/strokes/etymology) …')
  const hskChars = new Set()
  for (const word of hskWords.byWord.keys()) for (const ch of word) if (CJK.test(ch)) hskChars.add(ch)
  const charsIndex = {}
  let strokeFetches = 0
  await mapLimit([...hskChars], 8, async (ch) => {
    const dict = mamh.get(ch)
    const meta = {}
    if (dict?.radical) meta.r = dict.radical
    if (dict?.decomposition && !dict.decomposition.startsWith('？')) meta.d = dict.decomposition
    if (dict?.etymology) meta.e = dict.etymology
    const strokes = await loadStrokeCount(ch, { refresh })
    if (strokes) {
      meta.s = strokes
      strokeFetches++
    }
    if (Object.keys(meta).length) charsIndex[ch] = meta
  })
  fs.writeFileSync(path.join(INDEX_DIR, 'chars.json'), JSON.stringify(charsIndex))
  console.log(`  chars: ${Object.keys(charsIndex).length} (${strokeFetches} stroke lookups, ${(fs.statSync(path.join(INDEX_DIR, 'chars.json')).size / 1024).toFixed(0)} KB)`)

  // ── Write deck (seed contract: {deck, cards}) ──
  const out = path.join(DECK_DIR, 'hsk1-starter.json')
  fs.writeFileSync(out, JSON.stringify({ deck, cards: cleanCards }, null, 1))
  console.log(`ETL ▸ wrote ${out}`)

  // ── Neural audio (edge-tts): fills every gap Tatoeba left; skipped when the CLI is absent ──
  try {
    const { ensureDeckAudio } = await import('./audio.mjs')
    const { generated, failed } = await ensureDeckAudio({ deckFile: out })
    if (generated) console.log(`ETL ▸ synthesized ${generated} audio clips${failed ? ` (${failed} failed)` : ''}`)
  } catch (err) {
    console.warn(`ETL ▸ audio skipped: ${err.message}`)
  }
  const cardsForReport = JSON.parse(fs.readFileSync(out, 'utf8')).cards

  writeSourcesMarkdown(now)

  // ── Coverage report ──
  const n = cardsForReport.length
  const cov = (pred) => `${cardsForReport.filter(pred).length}/${n} (${Math.round((cardsForReport.filter(pred).length / n) * 100)}%)`
  const report = {
    generatedAt: new Date(now).toISOString(),
    words: n,
    coverage: {
      pinyin: cov((c) => c.pinyin),
      meaning: cov((c) => c.meaning),
      traditional: cov((c) => c.traditional),
      hskLevel: cov((c) => c.hskLevel != null),
      tone: cov((c) => c.tone),
      posTags: cov((c) => (c.tags || []).length > 1),
      radical: cov((c) => c.chars?.some((x) => x.radical)),
      strokes: cov((c) => c.chars?.some((x) => x.strokes)),
      decomposition: cov((c) => c.chars?.some((x) => x.decomposition)),
      etymology: cov((c) => c.chars?.some((x) => x.etymology)),
      examples: cov((c) => c.examples?.length),
      exampleAudio: cov((c) => c.examples?.some((x) => x.audioUrl)),
      nativeWordAudio: cov((c) => c.audioUrl),
      frequency: cov((c) => c.frequency != null),
    },
  }
  const reportFile = path.join(ROOT, '.cache/data/build-report.json')
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
  console.log('\nCoverage:')
  for (const [k, v] of Object.entries(report.coverage)) console.log(`  ${k.padEnd(18)} ${v}`)
  console.log(`\nReport: ${reportFile}`)
}

function buildCard(hanzi, id, deckId, hsk30, hskWords, cedict) {
  const h = hsk30.get(hanzi)
  const d = hskWords.byWord.get(hanzi)
  const ced = cedict.get(hanzi) || []

  // ── tone + reading: HSK official reading wins, CC-CEDICT is the fallback ──
  const numeric = d?.forms?.[0]?.transcriptions?.numeric || ced[0]?.pinyin || ''
  const marked =
    h?.pinyin ||
    d?.forms?.[0]?.transcriptions?.pinyin ||
    (numeric ? numericToMarked(numeric) : '')
  if (!marked) throw new Error(`No pinyin for "${hanzi}" — no source covers it`)
  const tone = h?.pinyin
    ? toneFromMarked(h.pinyin)
    : numeric
      ? toneFromNumeric(numeric)
      : toneFromMarked(marked)

  // ── primary dictionary entry: same reading as the HSK pinyin, else richest sense list ──
  const primary =
    ced.find((e) => toneFromNumeric(e.pinyin) === tone && e.definitions.length) ||
    ced.reduce((best, e) => (!best || e.definitions.length > best.definitions.length ? e : best), null)

  // ── meaning: every sense of the primary entry — full list, never truncated ──
  const senses = primary ? [...new Set(primary.definitions)] : (d?.forms?.[0]?.meanings || []).flat()
  const meaning = senses.join('; ')
  if (!meaning) throw new Error(`No meaning for "${hanzi}" — no source covers it`)

  // ── traditional ──
  const traditional = h?.traditional || primary?.traditional || ced[0]?.traditional || d?.forms?.[0]?.traditional || ''
  const hskLevel = h?.level ?? hskWords.levelByWord.get(hanzi) ?? undefined

  // ── tags: level + mapped POS (hsk30 primary, dictionary codes fallback) ──
  const posCodes = h?.posCodes?.length ? h.posCodes : d?.pos || []
  const tags = [`hsk${hskLevel ?? 1}`, ...mapPosTags(posCodes)]

  const card = {
    id,
    deckId,
    hanzi,
    pinyin: marked,
    meaning,
    tone,
    tags,
  }
  if (hskLevel != null) card.hskLevel = hskLevel
  if (traditional && traditional !== hanzi) card.traditional = traditional
  if (d?.frequency) card.frequency = d.frequency
  return card
}

function writeSourcesMarkdown(now) {
  const md = `# Data sources

Generated by \`npm run data:build\` on ${new Date(now).toISOString()}.
No content in this deck is hand-authored — every linguistic field comes from
the open sources below.

| Field | Source | License |
|---|---|---|
| \`hanzi\`, \`pinyin\`, \`tone\` (derived), \`meaning\`, \`traditional\` | [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) via MDBG | CC BY-SA 4.0 |
| \`hskLevel\`, \`tags\` (POS), \`pinyin\`, \`traditional\` | [ivankra/hsk30](https://github.com/ivankra/hsk30) (official HSK 3.0 lists) | CC BY-SA 4.0 (Hanban lists) |
| \`frequency\`, learner gloss fallback, POS fallback | [drkameleon/complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) | per repository |
| \`chars[].radical\`, \`chars[].decomposition\`, \`chars[].etymology\` | [skishore/makemeahanzi](https://github.com/skishore/makemeahanzi) (Unihan + CJKlib derived) | CC BY-SA 3.0 |
| \`chars[].strokes\`, stroke animation data | [hanzi-writer-data](https://github.com/hanzi-writer/data) (Make Me A Hanzi graphics; Arphic PL fonts derived) | see \`hanzi-data/LICENSE\` |
| \`examples[]\` | [Tatoeba](https://tatoeba.org) | CC BY 2.0 FR |
| \`audioUrl\` clips (word + sentence) | [edge-tts](https://github.com/rany2/edge-tts) over Microsoft Edge neural voices (zh-CN-XiaoxiaoNeural) | tool MIT; generated speech |

## Attribution

- CC-CEDICT: © MDBG and contributors, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Make Me A Hanzi: © Skishore et al., [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- Tatoeba sentence recordings: © respective contributors, [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/)
- Deck audio clips generated with edge-tts (Microsoft Edge read-aloud neural voices)
- HSK word lists: Hanban / Confucius Institute, published via open repositories
- Tone contours and pitch templates are original pedagogical content in \`src/utils/toneContour.ts\`
`
  fs.writeFileSync(path.join(DECK_DIR, 'SOURCES.md'), md)
}

main().catch((err) => {
  console.error('ETL failed:', err)
  process.exit(1)
})
