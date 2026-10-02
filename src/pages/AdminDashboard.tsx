import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { CardSchema, type Card } from '../data/schema'
import { fetchRemoteCards, saveRemoteCard, deleteRemoteCard } from '../data/remoteCards'
import {
  searchWiktionary,
  fetchWiktionaryDefinitions,
  containsHanzi,
} from '../data/api/wiktionary'
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

interface CedictEntry {
  t?: string
  p: string
  m: string[]
}

type CedictIndex = Record<string, CedictEntry>

interface SearchResult {
  id: string
  kind: 'cedict' | 'wiktionary'
  title: string
  pinyin?: string
  meaning?: string
  traditional?: string
  tone?: ToneValue
  snippet?: string
}

export function AdminDashboard() {
  const [, setLocation] = useLocation()
  const [cards, setCards] = useState<Card[]>([])
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  // Search
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])

  // Draft card
  const [hanzi, setHanzi] = useState('')
  const [pinyin, setPinyin] = useState('')
  const [meaning, setMeaning] = useState('')
  const [tone, setTone] = useState<ToneValue>('1')
  const [traditional, setTraditional] = useState('')
  const [tags, setTags] = useState('')
  const [example, setExample] = useState('')
  const [saving, setSaving] = useState(false)

  // Resources (Firebase RTDB)
  const [resources, setResources] = useState<ResourceLink[]>([])
  const [resTitle, setResTitle] = useState('')
  const [resUrl, setResUrl] = useState('')
  const [resNote, setResNote] = useState('')

  const fail = (text: string) => setNotice({ kind: 'error', text })
  const succeed = (text: string) => setNotice({ kind: 'ok', text })

  const cedictRef = useRef<CedictIndex | null>(null)

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

  async function ensureCedict(): Promise<CedictIndex> {
    if (cedictRef.current) return cedictRef.current
    const res = await fetch('/assets/deck/index/cedict-hsk.json')
    cedictRef.current = (await res.json()) as CedictIndex
    return cedictRef.current
  }

  function fillDraft(fields: {
    hanzi: string
    pinyin: string
    meaning: string
    tone: ToneValue
    traditional?: string
    example?: string
    tags?: string
  }) {
    setHanzi(fields.hanzi)
    setPinyin(fields.pinyin)
    setMeaning(fields.meaning)
    setTone(fields.tone)
    setTraditional(fields.traditional ?? '')
    setExample(fields.example ?? '')
    setTags(fields.tags ?? '')
    setNotice(null)
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setResults([])
    setNotice(null)

    try {
      const matches: SearchResult[] = []
      try {
        const cedict = await ensureCedict()
        const qLow = q.toLowerCase()
        const qNorm = qLow.replace(/\s+/g, '')
        for (const [key, entry] of Object.entries(cedict)) {
          const pLow = entry.p.toLowerCase()
          const pNorm = pLow.replace(/\s+/g, '')
          const exact = key === q
          const prefix = key.startsWith(q)
          const pinyinHit = pLow.startsWith(qLow) || pNorm.startsWith(qNorm)
          if (exact || prefix || pinyinHit) {
            matches.push({
              id: `c:${key}`,
              kind: 'cedict',
              title: key,
              pinyin: entry.p,
              meaning: entry.m.join('; '),
              traditional: entry.t,
              tone: toneFromMarked(entry.p),
            })
          }
          if (matches.length >= 12) break
        }
        matches.sort((a, b) => {
          const rank = (r: SearchResult) =>
            r.title === q ? 0 : r.title.startsWith(q) ? 1 : 2
          return rank(a) - rank(b)
        })
      } catch (err) {
        console.warn('CEDICT index unavailable', err)
      }

      // Wiktionary fills gaps — works when CEDICT misses or query is English.
      if (matches.length < 6) {
        try {
          const wiki = await searchWiktionary(q)
          for (const hit of wiki) {
            if (matches.some(m => m.title === hit.title)) continue
            matches.push({
              id: `w:${hit.title}`,
              kind: 'wiktionary',
              title: hit.title,
              snippet: hit.snippet,
            })
          }
        } catch (err) {
          console.warn('Wiktionary search unavailable', err)
        }
      }

      setResults(matches.slice(0, 12))
      if (matches.length === 0) fail(`Nothing found for “${q}”.`)
    } finally {
      setSearching(false)
    }
  }

  async function handlePick(result: SearchResult) {
    if (result.kind === 'cedict' && result.pinyin && result.meaning) {
      fillDraft({
        hanzi: result.title,
        pinyin: result.pinyin,
        meaning: result.meaning,
        tone: result.tone ?? '5',
        traditional: result.traditional,
      })
      return
    }

    // Wiktionary result → pull definitions for the hanzi title (or snippet).
    let word = containsHanzi(result.title) ? result.title : ''
    if (!word && result.snippet) {
      word = result.snippet.match(/[一-鿿]+/)?.[0] ?? ''
    }
    if (!word) {
      fail('Pick a result that contains Chinese characters, or fill the form manually.')
      return
    }

    setSearching(true)
    try {
      const senses = await fetchWiktionaryDefinitions(word)
      const meaning = senses.map(s => s.definition).join('; ')
      if (!meaning) fail(`No definitions found for ${word}.`)
      const exampleText = senses.find(s => s.example)?.example
      const posTags = [...new Set(senses.map(s => s.pos).filter(Boolean))].join(', ')

      // Pinyin from CEDICT when we have it, else admin fills it in.
      let pinyin = ''
      let traditionalText = ''
      let toneValue: ToneValue = '5'
      try {
        const cedict = await ensureCedict()
        const entry = cedict[word]
        if (entry) {
          pinyin = entry.p
          traditionalText = entry.t ?? ''
          toneValue = toneFromMarked(entry.p)
        }
      } catch {
        /* offline or index missing — manual pinyin */
      }

      fillDraft({
        hanzi: word,
        pinyin,
        meaning: meaning || result.snippet || '',
        tone: toneValue,
        traditional: traditionalText,
        example: exampleText,
        tags: posTags,
      })
      if (!meaning) fail('Definition came up empty — edit the fields before saving.')
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Wiktionary lookup failed.')
    } finally {
      setSearching(false)
    }
  }

  function handlePinyinChange(value: string) {
    setPinyin(value)
    const hasMark = /[āēīōūǖáéíóúǘǎěǐǒǔǚàèìòùǜ]/.test(value)
    setTone(hasMark ? toneFromMarked(value) : toneFromNumeric(value))
  }

  async function handleSaveCard(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const now = Date.now()
      const card: Card = {
        id: crypto.randomUUID(),
        deckId: DECK_ID,
        hanzi: hanzi.trim(),
        pinyin: pinyin.trim(),
        meaning: meaning.trim(),
        tone,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        ...(traditional.trim() ? { traditional: traditional.trim() } : {}),
        ...(example.trim() ? { example: example.trim() } : {}),
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
          placeholder="Search character / pinyin / English…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="submit" className="primary" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {results.length > 0 && (
        <div className="glass-panel overflow-hidden mb-6">
          {results.map(r => (
            <button
              key={r.id}
              type="button"
              className="card-row w-full text-left"
              onClick={() => handlePick(r)}
              disabled={searching}
            >
              <div className="card-row__main">
                <span className="font-bold text-lg hanzi-text">{r.title}</span>
                {r.pinyin && <span className="text-gray-400">{r.pinyin}</span>}
                {r.meaning && <span className="text-gray-500 text-sm">{r.meaning}</span>}
                {!r.meaning && r.snippet && (
                  <span className="text-gray-500 text-sm">{r.snippet}</span>
                )}
              </div>
              <span className="faint text-xs">
                {r.kind === 'cedict' ? 'CC-CEDICT' : 'Wiktionary'}
              </span>
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
        <label className="field">
          <span>Example sentence (optional)</span>
          <input placeholder="你好吗？" value={example} onChange={e => setExample(e.target.value)} />
        </label>
        <label className="field">
          <span>Tags (comma separated)</span>
          <input placeholder="greeting, hsk1" value={tags} onChange={e => setTags(e.target.value)} />
        </label>
        <p className="faint text-xs">
          Audio plays via the device voice engine — no audio URL needed.
        </p>
        <button type="submit" className="primary flex-1" disabled={saving}>
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
