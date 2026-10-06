/**
 * Handwriting pad — collect finger/mouse strokes on a canvas.
 *
 * Coordinates stay in CSS pixels; recognition normalises them itself, so a
 * resize between strokes never invalidates what was already drawn. Works
 * without a 2d context (jsdom tests) — strokes are tracked in state either
 * way, only the ink needs a canvas.
 *
 * Like the mobile keyboards, committed ink fades away after a short idle so
 * the pad never fills up: the parent receives `onFade` once the fade
 * finishes (it seals/clears) and can hold the fade off with `fadePaused`
 * while recognition is still in flight.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Undo2, Eraser, Delete } from 'lucide-react'
import type { Point, Stroke } from '../data/api/handwriting'

export interface PadSize {
  width: number
  height: number
}

interface DrawPadProps {
  strokes: Stroke[]
  /** Called on every change with the current ink and canvas size. */
  onChange: (strokes: Stroke[], size: PadSize) => void
  /** Fired once idle ink has fully faded out. */
  onFade?: () => void
  /** Idle ms before the fade starts; null/undefined disables auto-fade. */
  fadeAfterMs?: number | null
  /** Recognition in flight — hold the fade until it settles. */
  fadePaused?: boolean
  /** Wipe the pad clean (keeps the text the ink produced). */
  onCleanSlate?: () => void
  /** Delete the last character of the search text, keyboard-style. */
  onBackspace?: () => void
  /** Whether there is search text to backspace. */
  canBackspace?: boolean
}

const FADE_MS = 600

// rAF where it exists, a 16ms timer otherwise (jsdom) — same handle type.
const scheduleFrame = (cb: (t: number) => void): number =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(cb)
    : window.setTimeout(() => cb(performance.now()), 16)

const cancelFrame = (handle: number) => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
  else window.clearTimeout(handle)
}

export function DrawPad({
  strokes,
  onChange,
  onFade,
  fadeAfterMs,
  fadePaused,
  onCleanSlate,
  onBackspace,
  canBackspace,
}: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [active, setActive] = useState<Stroke | null>(null)
  const [inkAlpha, setInkAlpha] = useState(1)
  const drawingRef = useRef(false)
  // Pointer events fire faster than React re-renders; the committed stroke
  // must come from this ref or fast strokes lose their tail points.
  const activeRef = useRef<Stroke | null>(null)
  const pointerIdRef = useRef<number | null>(null)

  const timerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const onFadeRef = useRef(onFade)
  const beginFadeRef = useRef<() => void>(() => {})

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(80, Math.round(rect.width || 320))
    const height = Math.max(80, Math.round(rect.height || 240))
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    // Faint guide box + centre cross — writers proportion characters by it.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 6])
    ctx.strokeRect(10.5, 10.5, width - 21, height - 21)
    ctx.beginPath()
    ctx.moveTo(width / 2, 12)
    ctx.lineTo(width / 2, height - 12)
    ctx.moveTo(12, height / 2)
    ctx.lineTo(width - 12, height / 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Canvas cannot resolve CSS custom properties — mirrors --accent-rgb.
    // globalAlpha carries the fade; the guide above stays at full strength.
    ctx.globalAlpha = inkAlpha
    ctx.strokeStyle = 'rgb(72 169 138)'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const paint = (stroke: Stroke) => {
      if (!stroke.length) return
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
      if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y)
      ctx.stroke()
    }
    for (const stroke of strokes) paint(stroke)
    if (active) paint(active)
    ctx.globalAlpha = 1
  }, [strokes, active, inkAlpha])

  useEffect(() => {
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [draw])

  const clearTimers = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (frameRef.current !== null) {
      cancelFrame(frameRef.current)
      frameRef.current = null
    }
  }

  const cancelFade = useCallback(() => {
    clearTimers()
    setInkAlpha(1)
  }, [])

  // Fade body below — a ref keeps the schedule effect depending only on ink
  // and props, so unrelated parent renders must not restart the idle clock.
  const beginFade = () => {
    if (drawingRef.current) {
      // A finger is still down; try again once the stroke settles.
      timerRef.current = window.setTimeout(() => beginFadeRef.current(), 500)
      return
    }
    if (fadePaused) {
      timerRef.current = window.setTimeout(() => beginFadeRef.current(), 250)
      return
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onFadeRef.current?.()
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      frameRef.current = null
      const p = Math.min(1, (now - start) / FADE_MS)
      setInkAlpha(1 - p)
      if (p < 1) frameRef.current = scheduleFrame(step)
      else onFadeRef.current?.()
    }
    frameRef.current = scheduleFrame(step)
  }

  useEffect(() => {
    onFadeRef.current = onFade
    beginFadeRef.current = beginFade
  })

  useEffect(() => {
    if (!strokes.length || fadeAfterMs == null || !onFade) return
    timerRef.current = window.setTimeout(() => beginFadeRef.current(), fadeAfterMs)
    return clearTimers
  }, [strokes, fadeAfterMs, fadePaused, onFade])

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const sizeOf = (): PadSize => {
    const rect = canvasRef.current?.getBoundingClientRect()
    return {
      width: Math.max(80, Math.round(rect?.width || 320)),
      height: Math.max(80, Math.round(rect?.height || 240)),
    }
  }

  return (
    <div className="draw-pad">
      <canvas
        className="draw-pad__canvas"
        ref={canvasRef}
        aria-label="Character drawing area"
        role="img"
        onPointerDown={(e) => {
          // One stroke at a time — a palm or second finger landing mid-stroke
          // must not graft its points onto the line being drawn.
          if (drawingRef.current || pointerIdRef.current !== null) return
          cancelFade()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drawingRef.current = true
          pointerIdRef.current = e.pointerId
          const p = pointAt(e)
          activeRef.current = [p]
          setActive([p])
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current || e.pointerId !== pointerIdRef.current) return
          const p = pointAt(e)
          const ref = activeRef.current
          if (ref) {
            ref.push(p)
            setActive([...ref])
          } else {
            activeRef.current = [p]
            setActive([p])
          }
        }}
        onPointerUp={(e) => {
          if (!drawingRef.current || e.pointerId !== pointerIdRef.current) return
          drawingRef.current = false
          pointerIdRef.current = null
          const stroke = activeRef.current ?? [pointAt(e)]
          activeRef.current = null
          setActive(null)
          // A bare tap is a stray dot, not a stroke — drop it.
          if (stroke.length < 2) return
          onChange([...strokes, stroke], sizeOf())
        }}
        onPointerCancel={(e) => {
          if (e.pointerId !== pointerIdRef.current) return
          drawingRef.current = false
          pointerIdRef.current = null
          activeRef.current = null
          setActive(null)
        }}
      />
      <div className="draw-pad__actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            cancelFade()
            onChange(strokes.slice(0, -1), sizeOf())
          }}
          disabled={!strokes.length}
          aria-label="Undo stroke"
        >
          <Undo2 size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            cancelFade()
            onCleanSlate?.()
          }}
          disabled={!strokes.length}
          aria-label="Clean slate — clear the pad"
        >
          <Eraser size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onBackspace?.()}
          disabled={!canBackspace}
          aria-label="Backspace — delete last character"
        >
          <Delete size={18} aria-hidden="true" />
        </button>
        <span className="faint text-sm">
          {strokes.length} {strokes.length === 1 ? 'stroke' : 'strokes'}
        </span>
      </div>
    </div>
  )
}
