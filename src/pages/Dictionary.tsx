/**
 * Dictionary — search the HSK/CEDICT index by character, pinyin or meaning,
 * or switch to the draw pad and write by hand. Recognition mirrors the
 * mobile keyboards: the engine's top candidate lands in the search box as
 * you write (Gboard's Google IME endpoint), and the chip row offers
 * alternates to swap it. Offline, the local template matcher keeps the
 * pad working as tap-to-commit suggestions.
 *
 * Text search reuses the admin's tiered `searchDict()`. Draw mode blurs
 * the text input (that is what closes the mobile keyboard while you write)
 * and docks the pad like an IME panel above the tab bar; committed ink
 * auto-fades after a short idle, exactly like Gboard.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, PenLine, ChevronDown } from 'lucide-react'
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
import { recognizeGoogleIme } from '../data/api/googleIme'
import {
  clearHistory,
  loadHistory,
  pushHistory,
  HISTORY_DEBOUNCE_MS,
} from '../utils/dictHistory'
import { DrawPad, type PadSize } from '../components/DrawPad'
import { ToneText } from '../components/ui/ToneText'
import { toneFromMarked } from '../utils/pinyin'

// Idle ink lingers long enough to swap a candidate, then fades like the
// mobile keyboards' handwriting panels.
const AUTO_FADE_MS = 2000

export function Dictionary() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'text' | 'draw'>('text')
  const [dict, setDict] = useState<Record<string, DictEntry> | null>(null)
  const [dictError, setDictError] = useState(false)
  const [handwriting, setHandwriting] = useState<HandwritingIndex | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [candidates, setCandidates] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>(loadHistory)
  // A Google IME request is running — the fade must wait for its answer.
  const [recognizing, setRecognizing] = useState(false)
  // The online engine answered this ink, so there is committed text to
  // fade away to. Offline the local matcher never auto-commits, so its
  // tap-to-commit chips must outlive the ink — no fade in that case.
  const [autoFade, setAutoFade] = useState(false)

  // The slice of `query` that recognition auto-appended — replaced on the
  // next result (the keyboards' "pending" segment), stripped when the pad
  // is emptied, sealed when the user leaves draw mode.
  const pendingRef = useRef('')
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Record only settled queries — keystroke fragments would flood history.
  // Device-local by design (localStorage, never synced).
  useEffect(() => {
    const settled = query.trim()
    if (!settled) return
    const timer = setTimeout(() => setHistory(pushHistory(settled)), HISTORY_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const needsDict =
    query.trim().length > 0 || mode === 'draw' || (mode === 'text' && history.length > 0)
  useEffect(() => {
    if (!needsDict || dict) return
    loadDict()
      .then(setDict)
      .catch(() => setDictError(true))
  }, [needsDict, dict])

  useEffect(() => {
    if (mode !== 'draw' || handwriting) return
    // Lazily fetched on first draw-mode entry, then runtime-cached. The
    // offline fallback matcher runs on it when Google IME is unreachable.
    loadHandwriting().then(setHandwriting).catch(() => setHandwriting(null))
  }, [mode, handwriting])

  useEffect(() => {
    // The first stroke can land before the offline index finishes loading —
    // once it arrives, run the local fallback for the ink already on the
    // pad. Skipped when Google IME already committed a pending segment.
    if (!handwriting || !strokes.length || pendingRef.current) return
    setCandidates(recognizeHandwriting(strokes, handwriting, 8).map((h) => h.char))
  }, [handwriting, strokes])

  const results = useMemo(
    () => (dict && query.trim() ? searchDict(dict, query, 30) : []),
    [dict, query],
  )

  const applyRecognition = useCallback(
    async (ink: Stroke[], size: PadSize) => {
      if (!ink.length) {
        abortRef.current?.abort()
        const stale = pendingRef.current
        if (stale) {
          pendingRef.current = ''
          setQuery((q) => q.slice(0, Math.max(0, q.length - stale.length)))
        }
        setCandidates([])
        return
      }
      // A newer stroke supersedes the in-flight request.
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setRecognizing(true)
      try {
        const hits = await recognizeGoogleIme(ink, { ...size, signal: ac.signal })
        if (ac.signal.aborted) return
        setAutoFade(true)
        setCandidates(hits)
        const top = hits[0]
        if (top) {
          const prev = pendingRef.current
          pendingRef.current = top
          setQuery((q) => q.slice(0, Math.max(0, q.length - prev.length)) + top)
        }
      } catch (err) {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError'))
          return
        // Offline or endpoint gone — fall back to the local matcher as
        // tap-to-commit chips (no auto-commit: its top hit is less sure).
        setAutoFade(false)
        setCandidates(
          handwriting ? recognizeHandwriting(ink, handwriting, 8).map((h) => h.char) : [],
        )
      } finally {
        // Only the newest request owns the flag — an aborted one must not
        // clear the state of the request that replaced it.
        if (abortRef.current === ac) setRecognizing(false)
      }
    },
    [handwriting],
  )

  const handleStrokes = (next: Stroke[], size: PadSize) => {
    setStrokes(next)
    void applyRecognition(next, size)
  }

  // The idle ink faded away, or the eraser wiped the pad — either way the
  // pad is a clean slate while the text stays: seal the pending segment
  // (the keyboards drop recognized text into the field as the ink fades)
  // and drop the ink plus its chips.
  const handleCleanSlate = useCallback(() => {
    abortRef.current?.abort()
    pendingRef.current = ''
    setStrokes([])
    setCandidates([])
  }, [])

  // Keyboard-style backspace on the search text: the user's edit seals the
  // pending segment first, then the last character goes. Aborts the
  // in-flight request so it cannot resurrect the deleted character.
  const handleBackspace = () => {
    abortRef.current?.abort()
    pendingRef.current = ''
    setQuery((q) => (q.length ? q.slice(0, -1) : q))
  }

  const pickCandidate = (chars: string) => {
    // Swap the pending segment for the chosen candidate, then seal it.
    // Abort first — a stale in-flight result must not resurrect the swap.
    abortRef.current?.abort()
    const stale = pendingRef.current
    pendingRef.current = ''
    setQuery((q) => q.slice(0, Math.max(0, q.length - stale.length)) + chars)
    setStrokes([])
    setCandidates([])
    setExpanded(null)
  }

  const toggleMode = () => {
    const next = mode === 'text' ? 'draw' : 'text'
    // Leaving draw mode seals the pending segment (the query already
    // holds it); clearing strokes must not strip it back out.
    pendingRef.current = ''
    abortRef.current?.abort()
    setMode(next)
    setStrokes([])
    setCandidates([])
    setAutoFade(false)
    // The search box stays mounted (like the keyboard's text field) — but
    // its keyboard must not cover the pad: blur on the way in, refocus for
    // editing on the way out.
    if (next === 'draw') {
      inputRef.current?.blur()
      // The docked tray covers the lower half — make sure the field is
      // above it even when the user had scrolled down the result list.
      requestAnimationFrame(() =>
        inputRef.current?.scrollIntoView?.({ block: 'start' }),
      )
    } else inputRef.current?.focus()
  }

  return (
    <div
      className={`admin-shell dict-page${mode === 'draw' ? ' dict-page--draw' : ''}`}
    >
      <p className="eyebrow">dictionary</p>
      <h2 className="display text-3xl mb-6">Dictionary</h2>

      <div className="dict-search">
        <input
          type="search"
          className="dict-input"
          ref={inputRef}
          value={query}
          onChange={(e) => {
            // A manual edit seals the auto-appended segment — same as the
            // keyboards: what you type becomes permanent.
            pendingRef.current = ''
            setQuery(e.target.value)
          }}
          placeholder="Character, pinyin or meaning…"
          aria-label="Search the dictionary"
          autoFocus
        />
        <button
          type="button"
          className="icon-btn dict-mode-btn"
          aria-label={mode === 'text' ? 'Draw the character instead' : 'Type to search instead'}
          aria-pressed={mode === 'draw'}
          onClick={toggleMode}
        >
          {mode === 'text' ? <PenLine size={18} /> : <Keyboard size={18} />}
        </button>
      </div>

      {mode === 'draw' && (
        <p className="dict-hint faint" role="status">
          Draw below — the recognized text lands in the search box above.
          Tap a suggestion to swap it.
        </p>
      )}

      {mode === 'draw' && (
        <div className="dict-draw dict-draw--tray glass-panel">
          {/* Candidate strip sits above the writing area, keyboard-style. */}
          {strokes.length > 0 && (
            <div className="dict-suggest" aria-label="Character suggestions">
              {candidates.length === 0 && handwriting === null && (
                <span className="faint text-sm">Recognition unavailable offline.</span>
              )}
              {candidates.map((chars) => (
                <button
                  key={chars}
                  type="button"
                  className="dict-suggest__chip"
                  aria-label={`Use ${chars}`}
                  onClick={() => pickCandidate(chars)}
                >
                  <span className="dict-suggest__char">{chars}</span>
                  {dict?.[chars]?.p && (
                    <span className="dict-suggest__pinyin">{dict[chars].p}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <DrawPad
            strokes={strokes}
            onChange={handleStrokes}
            onFade={handleCleanSlate}
            fadeAfterMs={autoFade ? AUTO_FADE_MS : null}
            fadePaused={recognizing}
            onCleanSlate={handleCleanSlate}
            onBackspace={handleBackspace}
            canBackspace={query.length > 0}
          />
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
              <div className="dict-history__grid">
                {history.map((entry) => {
                  // Resolve through the same search the list runs: cards
                  // show what tapping them will actually find, even when
                  // the entry is pinyin or an English word.
                  const hit = dict ? searchDict(dict, entry, 1)[0] : undefined
                  return (
                    <button
                      key={entry}
                      type="button"
                      className="dict-history__card"
                      aria-label={`Search ${entry}`}
                      onClick={() => setQuery(entry)}
                    >
                      <span className="dict-history__card-hanzi">
                        {hit?.hanzi ?? entry}
                      </span>
                      {hit && (
                        <span className="dict-history__card-pinyin">{hit.pinyin}</span>
                      )}
                      {hit && (
                        <span className="dict-history__card-meaning">{hit.meaning}</span>
                      )}
                    </button>
                  )
                })}
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
        <span className="dict-result__charwrap">
          <span className="dict-result__char">{hit.hanzi}</span>
          {hit.traditional && (
            <span className="dict-result__trad">{hit.traditional}</span>
          )}
        </span>
        <span className="dict-result__body">
          <span className="dict-result__pinyin">
            {hit.pinyin.split(/\s+/).map((syl, i) => (
              <ToneText key={`${syl}-${i}`} text={syl} tone={toneFromMarked(syl)} />
            ))}
          </span>
          <span className="dict-result__meaning">{hit.meaning}</span>
        </span>
        {hit.hsk && <span className="dict-result__hsk">HSK {hit.hsk}</span>}
        <ChevronDown size={18} className="dict-result__chev" aria-hidden="true" />
      </button>
      {expanded && entry && (
        <div className="dict-result__detail">
          <ol className="dict-result__senses">
            {entry.m.map((sense, i) => (
              <li key={i}>{sense}</li>
            ))}
          </ol>
          {entry.g?.length ? <p className="faint text-sm">{entry.g.join(', ')}</p> : null}
        </div>
      )}
    </div>
  )
}
