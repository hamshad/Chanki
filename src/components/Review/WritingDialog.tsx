import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check } from 'lucide-react'
import HanziWriter from 'hanzi-writer'
import { loadCharData } from '../../data/api/hanziWriter'
import type { Tone } from '../../types'

interface WritingDialogProps {
  text: string
  tone: Tone
  /** Optional pinyin shown under the pad */
  hint?: string
  onClose: () => void
  /** Fires once every character has been traced */
  onComplete?: () => void
}

function pickPadSize() {
  return Math.max(160, Math.min(300, Math.round(Math.min(window.innerWidth * 0.55, window.innerHeight * 0.38))))
}

/**
 * Full-screen practice dialog: one character at a time, chips above light
 * up as each character is completed until all are filled. Pad is drawn in
 * plain DOM (no 3D transforms) so touch lands exactly where the finger is.
 */
export function WritingDialog({ text, tone, hint, onClose, onComplete }: WritingDialogProps) {
  const chars = useMemo(
    () => text.split('').filter((c) => c.match(/[一-龥]/)),
    [text],
  )
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState<boolean[]>(() => chars.map(() => false))
  const [size, setSize] = useState(pickPadSize)
  const allDone = done.length > 0 && done.every(Boolean)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  useEffect(() => {
    const onResize = () => setSize(pickPadSize())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (allDone) onComplete?.()
  }, [allDone, onComplete])

  const handleCharDone = () => {
    setDone((prev) => prev.map((v, i) => (i === index ? true : v)))
    if (index < chars.length - 1) setIndex(index + 1)
  }

  if (chars.length === 0) return null

  return createPortal(
    <div className="writing-overlay" onClick={onClose} role="presentation">
      <div
        className="writing-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Practice writing"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="info-sheet-head">
          <h3>Practice writing</h3>
          <button
            type="button"
            className="info-sheet-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="writing-chips">
          {chars.map((c, i) => (
            <button
              key={`${c}-${i}`}
              type="button"
              className={`writing-chip${i === index ? ' is-current' : ''}${done[i] ? ' is-done' : ''}`}
              aria-label={`Practice ${c}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => setIndex(i)}
            >
              {done[i] && i !== index ? <Check size={16} aria-hidden="true" /> : null}
              <span>{c}</span>
            </button>
          ))}
        </div>

        {allDone ? (
          <div className="writing-success">
            <Check size={44} aria-hidden="true" />
            <p>
              All {chars.length} {chars.length === 1 ? 'character' : 'characters'} written
            </p>
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="writing-stage">
              <CharPad
                key={`${chars[index]}-${index}`}
                char={chars[index]}
                tone={tone}
                size={size}
                onComplete={handleCharDone}
              />
            </div>
            <p className="writing-hint">
              {hint ? `${hint} · ` : ''}
              Character {index + 1} of {chars.length}
              {done[index] ? ' · written ✓' : ''}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function CharPad({
  char,
  tone,
  size,
  onComplete,
}: {
  char: string
  tone: Tone
  size: number
  onComplete: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const writerRef = useRef<HanziWriter | null>(null)
  const [error, setError] = useState(false)

  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!containerRef.current) return

    const rootStyle = getComputedStyle(document.documentElement)
    const strokeColor = rootStyle.getPropertyValue(`--tone-${tone}`).trim() || '#ffffff'
    const outlineColor = rootStyle.getPropertyValue('--bg-secondary').trim() || '#333333'
    // Ink thicker than the library default (4) — readable on a big pad
    const drawingWidth = Math.max(10, Math.round(size * 0.06))

    containerRef.current.innerHTML = ''
    setError(false)

    try {
      const writer = HanziWriter.create(containerRef.current, char, {
        width: size,
        height: size,
        padding: Math.round(size * 0.08),
        strokeColor: strokeColor,
        drawingColor: strokeColor,
        drawingWidth: drawingWidth,
        strokeWidth: Math.max(6, drawingWidth - 3),
        outlineWidth: Math.max(2, Math.round(size * 0.012)),
        outlineColor: outlineColor,
        showOutline: true,
        leniency: 1.5,
        showHintAfterMisses: 2,
        charDataLoader: (charToLoad, onLoad, onError) => {
          loadCharData(charToLoad).then((data) => {
            if (data) onLoad(data)
            else onError(new Error(`No stroke data for ${charToLoad}`))
          })
        },
      })

      writerRef.current = writer

      writer.quiz({
        onComplete: () => onCompleteRef.current(),
      })
    } catch (err) {
      console.error('HanziWriter error:', err)
      setError(true)
    }

    return () => {
      if (writerRef.current) {
        writerRef.current.cancelQuiz()
      }
    }
  }, [char, tone, size])

  return (
    <>
      <div className="writing-frame" style={{ width: size, height: size }}>
        <div
          ref={containerRef}
          className="writing-canvas"
          style={{ width: size, height: size, touchAction: 'none' }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {error && <span className="text-red-400 text-xs">Stroke data unavailable</span>}
    </>
  )
}
