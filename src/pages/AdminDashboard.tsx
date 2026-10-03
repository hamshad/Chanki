import { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { CardSchema, type Card, type CardExample, type CharMeta } from '../data/schema'
import { fetchRemoteCards, saveRemoteCard, deleteRemoteCard } from '../data/remoteCards'
import { fetchWiktionaryDefinitions } from '../data/api/wiktionary'
import {
  searchDict,
  loadDict,
  charsForWord,
  pickExamples,
  containsHanzi,
  type WordHit,
  type MatchKind,
} from '../data/api/search'
import { searchExamples } from '../data/api/tatoeba'
import { toneFromMarked, toneFromNumeric } from '../utils/pinyin'
import {
  subscribeResources,
  addResource,
  deleteResource,
  type ResourceLink,
} from '../data/resources'

/** Cards all belong to the seeded starter deck. */
const DECK_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

type ToneValue = '1' | '2' | '3' | '4' | '5'

const MATCH_LABEL: Record<MatchKind, string> = {
  hanzi: 'exact',
  traditional: 'traditional',
  pinyin: 'pinyin',
  prefix: 'starts with',
  contains: 'contains',
  meaning: 'meaning',
}

interface BaseDraft {
  hanzi: string
  pinyin: string
  meaning: string
  tone: ToneValue
  traditional?: string
  tags?: string
  hsk?: number | ''
  freq?: number | ''
}

export function AdminDashboard() {
  const [, setLocation] = useLocation()
  const [cards, setCards] = useState<Card[]>([])
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  // Search
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<WordHit[]>([])
  const [enriching, setEnriching] = useState(false)

  // Draft card — full template (matches seeded Firestore docs)
  const [hanzi, setHanzi] = useState('')
  const [pinyin, setPinyin] = useState('')
  const [meaning, setMeaning] = useState('')
  const [tone, setTone] = useState<ToneValue>('1')
  const [traditional, setTraditional] = useState('')
  const [tags, setTags] = useState('')
  const [hsk, setHsk] = useState<number | ''>('')
  const [freq, setFreq] = useState<number | ''>('')
  const [examples, setExamples] = useState<CardExample[]>([])
  const [chars, setChars] = useState<CharMeta[]>([])
  const [saving, setSaving] = useState(false)

  // Resources (Firebase RTDB)
  const [resources, setResources] = useState<ResourceLink[]>([])
  const [resTitle, setResTitle] = useState('')
  const [resUrl, setResUrl] = useState('')
  const [resNote, setResNote] = useState('')

  const fail = (text: string) => setNotice({ kind: 'error', text })
  const succeed = (text: string) => setNotice({ kind: 'ok', text })

  useEffect(() => {
    if (sessionStorage.getItem('admin') !== 'true') {
      setLocation('/review')
      return
    }
    loadCards()
    return subscribeResources(setResources)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadCards() {
    try {
      setCards(await fetchRemoteCards())
    } catch (err) {
      console.error(err)
      fail('Could not load cards from Firestore.')
    }
  }

  function fillDraft(base: BaseDraft) {
    setHanzi(base.hanzi)
    setPinyin(base.pinyin)
    setMeaning(base.meaning)
    setTone(base.tone)
    setTraditional(base.traditional ?? '')
    setTags(base.tags ?? '')
    setHsk(base.hsk ?? '')
    setFreq(base.freq ?? '')
    setExamples([])
    setChars([])
    setNotice(null)
  }

  function draftTags(hit: WordHit): string {
    const parts = [...hit.tags, ...(hit.hsk ? [`hsk${hit.hsk}`] : [])]
    return [...new Set(parts)].join(', ')
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setResults([])
    setNotice(null)
    try {
      const index = await loadDict()
      const hits = searchDict(index, q, 20)
      setResults(hits)
      if (hits.length) return

      // Zero local hits + hanzi query → exact-title Wiktionary (never the
      // noisy full-text English-title search).
      if (containsHanzi(q)) {
        await fillFromWiktionary(q)
        return
      }
      fail(`Nothing found for “${q}”.`)
    } catch (err) {
      console.error(err)
      fail('Dictionary index unavailable — check your connection and retry.')
    } finally {
      setSearching(false)
    }
  }

  async function handlePick(hit: WordHit) {
    fillDraft({
      hanzi: hit.hanzi,
      pinyin: hit.pinyin,
      meaning: hit.meaning,
      tone: hit.tone,
      traditional: hit.traditional,
      tags: draftTags(hit),
      hsk: hit.hsk ?? '',
      freq: hit.freq ?? '',
    })
    await enrichDraft(hit.hanzi)
  }

  /** Exact-title Wiktionary fill for words missing from the local index. */
  async function fillFromWiktionary(word: string) {
    setEnriching(true)
    try {
      const senses = await fetchWiktionaryDefinitions(word)
      const meaning = senses.map(s => s.definition).join('; ')
      if (!meaning) {
        fail(`Nothing found for “${word}”.`)
        return
      }
      const exampleText = senses.find(s => s.example)?.example
      const posTags = [...new Set(senses.map(s => s.pos).filter(Boolean))].join(', ')

      // Pinyin / level / frequency still come from the local index when it has
      // the word (it usually lacks only exotic entries).
      let pinyin = ''
      let toneValue: ToneValue = '5'
      let traditionalText = ''
      let hskValue: number | '' = ''
      let freqValue: number | '' = ''
      let tagsText = posTags
      try {
        const entry = (await loadDict())[word]
        if (entry) {
          pinyin = entry.p
          toneValue = toneFromMarked(entry.p)
          traditionalText = entry.t && entry.t !== word ? entry.t : ''
          hskValue = entry.l ?? ''
          freqValue = entry.f ?? ''
          const dictTags = [...(entry.g ?? []), ...(entry.l ? [`hsk${entry.l}`] : [])]
          if (dictTags.length) tagsText = [...new Set(dictTags)].join(', ')
        }
      } catch {
        /* index offline — admin fills pinyin manually */
      }

      fillDraft({
        hanzi: word,
        pinyin,
        meaning,
        tone: toneValue,
        traditional: traditionalText,
        tags: tagsText,
        hsk: hskValue,
        freq: freqValue,
      })
      if (!pinyin) {
        fail('Filled from Wiktionary — pinyin missing from the index, type it in.')
      }
      await enrichDraft(word, exampleText)
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Wiktionary lookup failed.')
    } finally {
      setEnriching(false)
    }
  }

  /**
   * Fill the template's enrichment fields: character breakdown from the local
   * chars index, example sentences from Tatoeba (live, keyless).
   */
  async function enrichDraft(word: string, fallbackExample?: string) {
    setEnriching(true)
    try {
      const [charMeta, raw] = await Promise.all([
        charsForWord(word).catch(() => []),
        searchExamples(word, 6).catch(() => []),
      ])
      const picked = pickExamples(word, raw, 3)
      const cardExamples: CardExample[] = picked
        .filter(e => e.zh.trim())
        .map(e => ({
          zh: e.zh.trim(),
          ...(e.en?.trim() ? { en: e.en.trim() } : {}),
          ...(e.id ? { sourceId: e.id } : {}),
          ...(e.audioUrl ? { audioUrl: e.audioUrl } : {}),
        }))
      if (!cardExamples.length && fallbackExample?.trim()) {
        if (fallbackExample.includes(word)) cardExamples.push({ zh: fallbackExample.trim() })
      }

      setChars(charMeta)
      setExamples(cardExamples)

      const parts = [
        charMeta.length ? `${charMeta.length} char breakdown` : null,
        cardExamples.length ? `${cardExamples.length} example${cardExamples.length > 1 ? 's' : ''}` : null,
      ].filter(Boolean)
      if (parts.length) succeed(`Enriched: ${parts.join(' + ')}.`)
      else succeed('No extra data found — fill the remaining fields by hand.')
    } catch (err) {
      console.error(err)
      succeed('Enrichment skipped (offline?) — base fields are filled.')
    } finally {
      setEnriching(false)
    }
  }

  function handlePinyinChange(value: string) {
    setPinyin(value)
    const hasMark = /[āēīōūǖáéíóúǘǎěǐǒǔǚàèìòùǜ]/.test(value)
    setTone(hasMark ? toneFromMarked(value) : toneFromNumeric(value))
  }

  function updateExample(index: number, patch: Partial<CardExample>) {
    setExamples(prev => prev.map((ex, i) => (i === index ? { ...ex, ...patch } : ex)))
  }

  function removeExample(index: number) {
    setExamples(prev => prev.filter((_, i) => i !== index))
  }

  function addExample() {
    setExamples(prev => [...prev, { zh: '', en: '' }])
  }

  async function handleSaveCard(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const now = Date.now()
      const cleanExamples = examples
        .map(ex => ({
          ...ex,
          zh: ex.zh.trim(),
          ...(ex.en ? { en: ex.en.trim() } : {}),
        }))
        .filter(ex => ex.zh)
      const card: Card = {
        id: crypto.randomUUID(),
        deckId: DECK_ID,
        hanzi: hanzi.trim(),
        pinyin: pinyin.trim(),
        meaning: meaning.trim(),
        tone,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        ...(traditional.trim() ? { traditional: traditional.trim() } : {}),
        ...(hsk !== '' ? { hskLevel: hsk } : {}),
        ...(freq !== '' && freq > 0 ? { frequency: freq } : {}),
        ...(cleanExamples.length
          ? { examples: cleanExamples, example: cleanExamples[0].zh }
          : {}),
        ...(chars.length ? { chars } : {}),
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      }
      CardSchema.parse(card)
      await saveRemoteCard(card)
      await loadCards()
      fillDraft({ hanzi: '', pinyin: '', meaning: '', tone: '1' })
      setQuery('')
      setResults([])
      succeed(`Saved ${card.hanzi} (${card.pinyin}) to Firestore.`)
    } catch (err) {
      fail(err instanceof Error ? err.message : 'That card could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCard(card: Card) {
    if (!window.confirm(`Delete ${card.hanzi} (${card.pinyin}) from Firestore?`)) return
    try {
      await deleteRemoteCard(card.id)
      await loadCards()
      succeed('Card deleted.')
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  async function handleAddResource(e: React.FormEvent) {
    e.preventDefault()
    if (!resTitle.trim() || !resUrl.trim()) {
      fail('Resource needs a title and a URL.')
      return
    }
    try {
      await addResource({ title: resTitle, url: resUrl, note: resNote })
      setResTitle('')
      setResUrl('')
      setResNote('')
      succeed('Resource added.')
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not save resource.')
    }
  }

  async function handleDeleteResource(id: string) {
    if (!window.confirm('Remove this resource?')) return
    try {
      await deleteResource(id)
      succeed('Resource removed.')
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not remove resource.')
    }
  }

  return (
    <div className="admin-shell">
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="eyebrow">hidden panel</p>
          <h2 className="display text-3xl">Admin</h2>
        </div>
        <button
          className="btn-quiet"
          onClick={() => {
            sessionStorage.removeItem('admin')
            setLocation('/home')
          }}
        >
          Exit admin
        </button>
      </div>

      {notice && (
        <div
          className={`alert mb-6 ${notice.kind === 'error' ? 'alert--error' : 'alert--ok'}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      {/* ─── Search → pick → save ─────────────────────────────────── */}
      <form onSubmit={handleSearch} className="admin-toolbar glass-panel p-4">
        <input
          className="flex-1"
          placeholder="Search hanzi / pinyin / English…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="submit" className="primary" disabled={searching || enriching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
        {enriching && <span className="chip chip--live">Fetching…</span>}
      </form>

      {results.length > 0 && (
        <div className="search-results glass-panel overflow-hidden mb-6">
          <div className="search-results__head">
            <span className="eyebrow">{results.length} results</span>
            <span className="faint text-xs">tap to fill the full card</span>
          </div>
          {results.map(r => (
            <button
              key={r.hanzi}
              type="button"
              className="search-hit"
              onClick={() => handlePick(r)}
              disabled={searching || enriching}
            >
              <span className="search-hit__line">
                <span className="search-hit__hanzi hanzi-text">{r.hanzi}</span>
                <span className={`search-hit__pinyin tone-${r.tone}`}>{r.pinyin}</span>
                <span className="search-hit__chips">
                  {r.hsk && <span className="chip chip--live">HSK {r.hsk}</span>}
                  <span className="chip">{MATCH_LABEL[r.match]}</span>
                  {r.freq && <span className="chip">freq {r.freq}</span>}
                  {r.traditional && <span className="chip">{r.traditional}</span>}
                </span>
              </span>
              <span className="search-hit__meaning">{r.meaning}</span>
              {r.tags.length > 0 && (
                <span className="search-hit__tags faint text-xs">{r.tags.join(' · ')}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSaveCard} className="glass-panel admin-form mb-8">
        <h3 className="display text-2xl">Add card → Firestore</h3>
        <label className="field">
          <span>Hanzi</span>
          <input placeholder="你好" required value={hanzi} onChange={e => setHanzi(e.target.value)} />
        </label>
        <label className="field">
          <span>Pinyin</span>
          <input
            placeholder="nǐ hǎo"
            required
            value={pinyin}
            onChange={e => handlePinyinChange(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Meaning</span>
          <input
            placeholder="hello; hi"
            required
            value={meaning}
            onChange={e => setMeaning(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Tone</span>
          <select value={tone} onChange={e => setTone(e.target.value as ToneValue)}>
            <option value="1">Tone 1 — high level</option>
            <option value="2">Tone 2 — rising</option>
            <option value="3">Tone 3 — dip-rise</option>
            <option value="4">Tone 4 — falling</option>
            <option value="5">Tone 5 (neutral)</option>
          </select>
        </label>
        <label className="field">
          <span>Traditional (optional)</span>
          <input placeholder="你好" value={traditional} onChange={e => setTraditional(e.target.value)} />
        </label>
        <div className="field-pair">
          <label className="field">
            <span>HSK level (optional)</span>
            <select value={hsk} onChange={e => setHsk(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Frequency rank (optional)</span>
            <input
              type="number"
              min={1}
              placeholder="130"
              value={freq}
              onChange={e => setFreq(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
        </div>

        <div className="field">
          <span>
            Examples {enriching && <em className="faint">(fetching…)</em>}
          </span>
          {examples.map((ex, i) => (
            <div className="ex-row" key={i}>
              <input
                placeholder="你好吗？"
                value={ex.zh}
                onChange={e => updateExample(i, { zh: e.target.value })}
              />
              <input
                placeholder="How are you?"
                value={ex.en ?? ''}
                onChange={e => updateExample(i, { en: e.target.value })}
              />
              <button
                type="button"
                className="btn-quiet"
                onClick={() => removeExample(i)}
                aria-label="Remove example"
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn-quiet" onClick={addExample}>
            + Add example
          </button>
        </div>

        {chars.length > 0 && (
          <div className="field">
            <span>Characters ({chars.length})</span>
            <div className="chars-preview">
              {chars.map(c => (
                <div className="char-chip" key={c.char}>
                  <span className="hanzi-text char-chip__char">{c.char}</span>
                  <span className="faint text-xs">
                    {c.radical}
                    {c.strokes ? ` · ${c.strokes} strokes` : ''}
                  </span>
                  {c.decomposition && (
                    <span className="text-xs text-gray-500">{c.decomposition}</span>
                  )}
                  {c.etymology?.hint && (
                    <span className="char-chip__hint">{c.etymology.hint}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <label className="field">
          <span>Tags (comma separated)</span>
          <input placeholder="greeting, hsk1" value={tags} onChange={e => setTags(e.target.value)} />
        </label>
        <p className="faint text-xs">
          Saved cards play through the device voice engine until you run{' '}
          <code>npm run data:audio</code> — it synthesizes neural clips and links them
          automatically (then <code>firebase deploy --only hosting</code>).
        </p>
        <button type="submit" className="primary flex-1" disabled={saving || enriching}>
          {saving ? 'Saving…' : 'Save to Firestore'}
        </button>
      </form>

      {/* ─── Cards in Firestore ──────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="display text-2xl mb-4">Cards in Firestore ({cards.length})</h3>
        <div className="glass-panel overflow-hidden">
          {cards.length === 0 && (
            <p className="p-4 faint text-sm">
              Nothing yet — search above, pick a result, save. Or run <code>npm run db:seed</code>{' '}
              to push the starter deck.
            </p>
          )}
          {cards.map(c => (
            <div key={c.id} className="card-row">
              <div className="card-row__main">
                <span className="font-bold text-lg hanzi-text">{c.hanzi}</span>
                <span className="text-gray-400">{c.pinyin}</span>
                <span className="text-gray-500 text-sm">{c.meaning}</span>
                {c.hskLevel && <span className="chip chip--live">HSK {c.hskLevel}</span>}
                {c.examples && c.examples.length > 0 && (
                  <span className="chip">{c.examples.length} ex</span>
                )}
              </div>
              <button onClick={() => handleDeleteCard(c)} className="btn-quiet">
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Resources (Realtime Database) ───────────────────────── */}
      <div>
        <h3 className="display text-2xl mb-4">Resources ({resources.length})</h3>
        <form onSubmit={handleAddResource} className="admin-toolbar glass-panel p-4 mb-4">
          <input
            placeholder="Title"
            value={resTitle}
            onChange={e => setResTitle(e.target.value)}
          />
          <input
            placeholder="https://…"
            value={resUrl}
            onChange={e => setResUrl(e.target.value)}
          />
          <input
            placeholder="Note (optional)"
            value={resNote}
            onChange={e => setResNote(e.target.value)}
          />
          <button type="submit" className="primary">
            Add link
          </button>
        </form>
        <div className="glass-panel overflow-hidden">
          {resources.length === 0 && (
            <p className="p-4 faint text-sm">No resources yet.</p>
          )}
          {resources.map(r => (
            <div key={r.id} className="card-row">
              <div className="card-row__main">
                <span className="font-bold">{r.title}</span>
                <span className="text-gray-500 text-sm">{r.url}</span>
                {r.note && <span className="text-gray-500 text-xs">{r.note}</span>}
              </div>
              <button onClick={() => handleDeleteResource(r.id)} className="btn-quiet">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
