import { useState, useEffect, useRef, useCallback } from 'react'
import { ToneText } from '../ui/ToneText'
import { GradingButtons } from './GradingButtons'
import { WritingDialog } from './WritingDialog'
import { InfoSheet } from './InfoSheet'
import { playAudio } from '../../utils/audio'
import { searchExamples, type ExampleSentence } from '../../data/api/tatoeba'
import { Volume2 } from 'lucide-react'
import { scheduler, type SchedulerPreview } from '../../scheduler'
import { getProgress, saveReview } from '../../data/review'
import { getOrCreateDeviceId } from '../../data/device-id'
import type { Card } from '../../data/schema'
import type { Tone, Rating, Progress } from '../../types'
import { splitMeasureWords, meaningTextStyle } from '../../utils/meaning'

interface CardViewProps {
  card: Card
  /** rating + the new due timestamp (ms) so the session can requeue sub-day cards. */
  onNext: (rating: Rating, nextDueMs: number) => void
}

/**
 * Cube card: four faces on a rotating 3D cube (character → pinyin →
 * meaning → tone). Tap, swipe, scroll or use arrow keys to rotate; the
 * bottom map shows what each face reveals and which are still unvisited.
 * Grading unlocks once all four faces have been seen.
 */
const SIDES = ['hanzi', 'pinyin', 'meaning', 'tone'] as const
const SIDE_LABELS: Record<(typeof SIDES)[number], string> = {
  hanzi: 'Character',
  pinyin: 'Pinyin',
  meaning: 'Meaning',
  tone: 'Tone',
}

export function CardView({ card, onNext }: CardViewProps) {
  const [sideIndex, setSideIndex] = useState(0)
  const [visited, setVisited] = useState<boolean[]>([true, false, false, false])
  const [preview, setPreview] = useState<SchedulerPreview | null>(null)
  const [deviceId, setDeviceId] = useState<string>('')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [isWriting, setIsWriting] = useState(false)
  const [hasWritten, setHasWritten] = useState(false)
  const [live, setLive] = useState<{ cardId: string; list: ExampleSentence[] } | null>(null)
  const [sheet, setSheet] = useState<'examples' | 'measureWords' | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const lastWheelAt = useRef(0)
  const dragRef = useRef<{ x: number; y: number; swiped: boolean } | null>(null)
  const suppressClickRef = useRef(false)

  const isFullyRevealed = visited.every(Boolean)

  useEffect(() => {
    async function loadProgress() {
      const devId = await getOrCreateDeviceId()
      setDeviceId(devId)
      const existing = await getProgress(card.id, devId)
      setProgress(existing)
      setPreview(scheduler.preview(card.id, existing))
    }
    loadProgress()
    setIsWriting(false)
    setHasWritten(false)
    setSheet(null)
    setSideIndex(0)
    setVisited([true, false, false, false])

    // Sourced examples ride on the card; fall back to a live Tatoeba lookup
    // for cards created without them (e.g. admin-entered words).
    if (!card.examples?.length && !card.example) {
      let cancelled = false
      searchExamples(card.hanzi, 2)
        .then((list) => {
          if (!cancelled) setLive({ cardId: card.id, list })
        })
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  // Face depth: half the stage width keeps the four faces edge-to-edge.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () =>
      stage.style.setProperty('--cube-half', `${Math.round(stage.clientWidth / 2)}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const rotateTo = useCallback((index: number) => {
    const target = (index + SIDES.length) % SIDES.length
    setSideIndex(target)
    setVisited((prev) =>
      prev[target] ? prev : prev.map((seen, i) => seen || i === target),
    )
  }, [])

  const rotateBy = (delta: number) => rotateTo(sideIndex + delta)

  const handleStageClick = () => {
    if (suppressClickRef.current || sheet) return
    if (isWriting) return // Don't rotate while writing
    rotateBy(1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (sheet) return // Popup owns the keyboard while open
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!isWriting) rotateBy(1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      rotateBy(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      rotateBy(-1)
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (sheet || isWriting) return
    const now = Date.now()
    if (now - lastWheelAt.current < 450) return
    if (Math.abs(e.deltaY) < 8 && Math.abs(e.deltaX) < 8) return
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    const dir = delta > 0 ? 1 : -1

    // If the current face can still scroll in this direction, let it scroll
    // instead of rotating the cube away from the reader.
    const face = stageRef.current?.querySelector<HTMLElement>(
      `.cube-face:nth-child(${sideIndex + 1})`,
    )
    if (face && face.scrollHeight > face.clientHeight + 2) {
      const atTop = face.scrollTop <= 0
      const atBottom = face.scrollTop + face.clientHeight >= face.scrollHeight - 2
      if ((dir > 0 && !atBottom) || (dir < 0 && !atTop)) return
    }

    lastWheelAt.current = now
    rotateBy(dir)
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isWriting || e.pointerType === 'mouse') return // drawing/click handle their own input
    dragRef.current = { x: e.clientX, y: e.clientY, swiped: false }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isWriting) return
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.swiped && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      drag.swiped = true
      suppressClickRef.current = true
      setTimeout(() => {
        suppressClickRef.current = false
      }, 350)
      rotateBy(dx < 0 ? 1 : -1)
    }
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  const handleGrade = async (rating: Rating) => {
    if (!deviceId || !preview) return
    const result = scheduler.apply(card.id, deviceId, progress, rating)
    await saveReview(result.progress, result.reviewLog)
    onNext(rating, result.progress.due)
  }

  const handleWriteComplete = () => {
    // Keep the dialog open — its success screen closes itself
    setHasWritten(true)
  }

  const handlePlayAudio = (e: React.MouseEvent) => {
    e.stopPropagation()
    playAudio(card.audioUrl, card.hanzi)
  }

  // Helper to safely cast tone string to Tone enum type since Card.tone is a string union
  const tone = card.tone as Tone

  // Sourced examples first, live Tatoeba only for cards created without them.
  const { main: mainMeaning, measureWords } = splitMeasureWords(card.meaning)
  const examples: { zh: string; en?: string }[] = (card.examples ?? []).map((e) => ({
    zh: e.zh,
    en: e.en,
  }))
  if (!examples.length && card.example) examples.push({ zh: card.example })
  if (!examples.length && live?.cardId === card.id) {
    examples.push(
      ...live.list.slice(0, 2).map((e) => ({ zh: e.zh, en: e.en })),
    )
  }

  return (
    <div className="card-container flex flex-col items-center w-full">
      <div
        className="glass-panel flashcard"
        onClick={handleStageClick}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="button"
        tabIndex={0}
        aria-label="Flashcard cube — tap, swipe or scroll to rotate sides"
      >
        <div className="cube-stage" ref={stageRef}>
          <div
            className="cube"
            style={{ transform: `rotateY(${-90 * sideIndex}deg)` }}
          >
            {/* Face 0 — character */}
            <div className="cube-face">
              <span className="face-label">Character</span>
              <div className="face-stack">
                <ToneText
                  text={card.hanzi}
                  tone={tone}
                  isHanzi
                  className="hanzi-display"
                />
                {(card.traditional || card.chars?.some((c) => c.radical || c.strokes)) && (
                  <div className="flex flex-wrap justify-center gap-2 text-xs text-gray-500">
                    {card.traditional && (
                      <span className="chip">繁體 {card.traditional}</span>
                    )}
                    {card.chars?.map((c) => (
                      <span key={c.char} className="chip">
                        {c.char}
                        {c.radical && ` · ${c.radical}`}
                        {c.strokes != null && ` · ${c.strokes} strokes`}
                      </span>
                    ))}
                  </div>
                )}
                {!hasWritten && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsWriting(true)
                    }}
                    className="btn-quiet"
                  >
                    Practice writing
                  </button>
                )}
                {hasWritten && <span className="chip chip--live">✓ Written</span>}
              </div>
            </div>

            {/* Face 1 — pinyin */}
            <div className="cube-face">
              <span className="face-label">Pinyin</span>
              <ToneText text={card.pinyin} tone={tone} className="pinyin-display" />
            </div>

            {/* Face 2 — meaning (extras behind popup pills) */}
            <div className="cube-face cube-face--meaning">
              <span className="face-label">Meaning</span>
              <MeaningBody
                main={mainMeaning}
                measureWords={measureWords}
                exampleCount={examples.length}
                onOpen={setSheet}
              />
            </div>

            {/* Face 3 — tone quiz */}
            <div className="cube-face">
              <span className="face-label">Tone</span>
              <div className="face-stack">
                <ToneText text={`Tone ${tone}`} tone={tone} className="text-xl font-bold" />
                <button
                  type="button"
                  onClick={handlePlayAudio}
                  className="p-3 rounded-full bg-gray-800 text-blue-400 border hover:bg-gray-700 hover:text-blue-300 transition-colors"
                  aria-label="Play Audio"
                >
                  <Volume2 size={24} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Map: what each face reveals + current position */}
        <div className="cube-map" aria-label="Cube sides">
          {SIDES.map((side, i) => (
            <button
              key={side}
              type="button"
              className={`cube-map-item${i === sideIndex ? ' is-current' : ''}${
                visited[i] ? '' : ' is-unvisited'
              }`}
              aria-current={i === sideIndex ? 'true' : undefined}
              aria-label={`Show ${SIDE_LABELS[side]} side`}
              onClick={(e) => {
                e.stopPropagation()
                rotateTo(i)
              }}
            >
              {SIDE_LABELS[side]}
            </button>
          ))}
        </div>
      </div>

      {isFullyRevealed ? (
        preview ? (
          <GradingButtons preview={preview} onGrade={handleGrade} />
        ) : (
          <div className="grade-bar text-gray-400 text-sm animate-pulse">
            Loading scheduling...
          </div>
        )
      ) : (
        <div className="grade-bar text-sm text-center faint">
          Tap, swipe or scroll the cube — visit all four sides to grade
        </div>
      )}

      {sheet && (
        <InfoSheet
          title={sheet === 'examples' ? 'Examples' : 'Measure words'}
          onClose={() => setSheet(null)}
        >
          {sheet === 'examples' ? (
            <ul className="example-list">
              {examples.map((ex) => (
                <li key={ex.zh} className="example-item">
                  <div className="example-zh">{ex.zh}</div>
                  {ex.en && <div className="example-en">{ex.en}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mw-list">
              {measureWords.map((mw) => (
                <span key={mw} className="mw-chip">
                  {mw}
                </span>
              ))}
            </div>
          )}
        </InfoSheet>
      )}

      {isWriting && (
        <WritingDialog
          text={card.hanzi}
          tone={tone}
          hint={card.pinyin}
          onClose={() => setIsWriting(false)}
          onComplete={handleWriteComplete}
        />
      )}
    </div>
  )
}

/**
 * Meaning face: ALL senses visible (type scales to length — no scroll,
 * no truncation); extras live behind pill buttons that open a popup.
 */
function MeaningBody({
  main,
  measureWords,
  exampleCount,
  onOpen,
}: {
  main: string
  measureWords: string[]
  exampleCount: number
  onOpen: (kind: 'examples' | 'measureWords') => void
}) {
  const style = meaningTextStyle(main.length)

  return (
    <div className="meaning-body">
      <span className="meaning-display text-gray-400" style={style}>
        {main}
      </span>

      {(exampleCount > 0 || measureWords.length > 0) && (
        <div className="meaning-actions">
          {exampleCount > 0 && (
            <button
              type="button"
              className="info-btn"
              onClick={(e) => {
                e.stopPropagation()
                onOpen('examples')
              }}
            >
              Examples · {exampleCount}
            </button>
          )}
          {measureWords.length > 0 && (
            <button
              type="button"
              className="info-btn"
              onClick={(e) => {
                e.stopPropagation()
                onOpen('measureWords')
              }}
            >
              Measure words · {measureWords.length}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
