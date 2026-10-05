/**
 * Dictionary — search the HSK/CEDICT index by character, pinyin or meaning,
 * or switch to the draw pad and write the character by hand: stroke
 * suggestions update after every stroke, like a Chinese keyboard.
 *
 * Text search reuses the admin's tiered `searchDict()`; drawing taps the
 * build-time handwriting index (stroke medians) for live recognition.
 * Flipping to draw mode unmounts the text input, which is what closes the
 * mobile keyboard while you write.
 */
import { useEffect, useMemo, useState } from 'react'
import { Keyboard, PenLine } from 'lucide-react'
import {
  loadDict,
  searchDict,
  type DictEntry,
  type WordHit,
} from '../data/api/search'
import {
  loadHandwriting,
  recognizeHandwriting,
  type HandwritingIndex,
  type Stroke,
} from '../data/api/handwriting'
import {
  clearHistory,
  loadHistory,
  pushHistory,
  HISTORY_DEBOUNCE_MS,
} from '../utils/dictHistory'
import { DrawPad } from '../components/DrawPad'

export function Dictionary() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'text' | 'draw'>('text')
  const [dict, setDict] = useState<Record<string, DictEntry> | null>(null)
  const [dictError, setDictError] = useState(false)
  const [handwriting, setHandwriting] = useState<HandwritingIndex | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>(loadHistory)

  // Record only settled queries — keystroke fragments would flood history.
  // Device-local by design (localStorage, never synced).
  useEffect(() => {
    const settled = query.trim()
    if (!settled) return
    const timer = setTimeout(() => setHistory(pushHistory(settled)), HISTORY_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const needsDict = query.trim().length > 0 || mode === 'draw'
  useEffect(() => {
    if (!needsDict || dict) return
    loadDict()
      .then(setDict)
      .catch(() => setDictError(true))
  }, [needsDict, dict])

  useEffect(() => {
    if (mode !== 'draw' || handwriting) return
    // Lazily fetched on first draw-mode entry, then runtime-cached.
    loadHandwriting().then(setHandwriting).catch(() => setHandwriting(null))
  }, [mode, handwriting])

  const results = useMemo(
    () => (dict && query.trim() ? searchDict(dict, query, 30) : []),
    [dict, query],
  )

  const suggestions = useMemo(
    () =>
      mode === 'draw' && handwriting && strokes.length
        ? recognizeHandwriting(strokes, handwriting, 8)
        : [],
    [mode, handwriting, strokes],
  )

  const commitSuggestion = (char: string) => {
    setQuery((q) => q + char)
    setStrokes([])
    setExpanded(null)
  }

  return (
    <div className="admin-shell">
      <p className="eyebrow">dictionary</p>
      <h2 className="display text-3xl mb-6">Dictionary</h2>

      <div className="dict-search">
        {mode === 'text' ? (
          <input
            type="search"
            className="dict-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Character, pinyin or meaning…"
            aria-label="Search the dictionary"
            autoFocus
          />
        ) : (
          <p className="dict-hint faint" role="status">
            Draw below — suggestions appear as you go. Tap one to add it to
            your search.
          </p>
        )}
        <button
          type="button"
          className="icon-btn dict-mode-btn"
          aria-label={mode === 'text' ? 'Draw the character instead' : 'Type to search instead'}
          aria-pressed={mode === 'draw'}
          onClick={() => {
            // Toggling away unmounts the opposite surface; in draw mode the
            // text input is gone, so the mobile keyboard closes with it.
            setMode(mode === 'text' ? 'draw' : 'text')
            setStrokes([])
          }}
        >
          {mode === 'text' ? <PenLine size={18} /> : <Keyboard size={18} />}
        </button>
      </div>

      {mode === 'draw' && (
        <div className="dict-draw glass-panel">
          <DrawPad strokes={strokes} onChange={setStrokes} />
          {strokes.length > 0 && (
            <div className="dict-suggest" aria-label="Character suggestions">
              {suggestions.length === 0 && handwriting === null && (
                <span className="faint text-sm">Recognition unavailable offline.</span>
              )}
              {suggestions.map((hit) => (
                <button
                  key={hit.char}
                  type="button"
                  className="dict-suggest__chip"
                  aria-label={`Use ${hit.char}`}
                  onClick={() => commitSuggestion(hit.char)}
                >
                  <span className="dict-suggest__char">{hit.char}</span>
                  {dict?.[hit.char]?.p && (
                    <span className="dict-suggest__pinyin">{dict[hit.char].p}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {dictError && (
        <div className="state-block" role="alert">
          <h3 className="state-title">Dictionary unavailable</h3>
          <p>The index could not be downloaded. Reconnect once and revisit.</p>
        </div>
      )}

      {needsDict && !dict && !dictError && (
        <p className="faint text-sm mt-4" role="status">
          Loading dictionary…
        </p>
      )}

      {results.length > 0 && (
        <ul className="dict-results">
          {results.map((hit) => (
            <li key={hit.hanzi}>
              <DictRow
                hit={hit}
                entry={dict?.[hit.hanzi]}
                expanded={expanded === hit.hanzi}
                onToggle={() => setExpanded(expanded === hit.hanzi ? null : hit.hanzi)}
              />
            </li>
          ))}
        </ul>
      )}

      {dict && query.trim() && results.length === 0 && (
        <div className="state-block">
          <p className="faint">No matches for “{query}”.</p>
        </div>
      )}

      {!query.trim() && mode === 'text' && (
        <div className="state-block dict-history">
          {history.length > 0 && (
            <>
              <div className="dict-history__head">
                <span className="eyebrow">recent</span>
                <button
                  type="button"
                  className="btn-quiet"
                  aria-label="Clear search history"
                  onClick={() => {
                    clearHistory()
                    setHistory([])
                  }}
                >
                  Clear
                </button>
              </div>
              <div className="dict-history__chips">
                {history.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className="dict-history__chip"
                    onClick={() => setQuery(entry)}
                  >
                    {entry}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="faint">
            Search by character (你), pinyin (ni3 / nǐ) or meaning (hello) — or
            draw it with the pen.
          </p>
        </div>
      )}
    </div>
  )
}

function DictRow({
  hit,
  entry,
  expanded,
  onToggle,
}: {
  hit: WordHit
  entry?: DictEntry
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="dict-result">
      <button
        type="button"
        className="dict-result__main"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="dict-result__char">{hit.hanzi}</span>
        <span className="dict-result__body">
          <span className="dict-result__pinyin">{hit.pinyin}</span>
          <span className="dict-result__meaning">{hit.meaning}</span>
        </span>
        {hit.hsk && <span className="dict-result__hsk">HSK {hit.hsk}</span>}
      </button>
      {expanded && entry && (
        <div className="dict-result__detail">
          <ol className="dict-result__senses">
            {entry.m.map((sense, i) => (
              <li key={i}>{sense}</li>
            ))}
          </ol>
          <p className="faint text-sm">
            {hit.traditional && <span>Traditional: {hit.traditional} · </span>}
            {entry.g?.length ? entry.g.join(', ') : '—'}
          </p>
        </div>
      )}
    </div>
  )
}
