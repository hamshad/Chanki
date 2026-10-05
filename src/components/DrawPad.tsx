/**
 * Handwriting pad — collect finger/mouse strokes on a canvas.
 *
 * Coordinates stay in CSS pixels; recognition normalises them itself, so a
 * resize between strokes never invalidates what was already drawn. Works
 * without a 2d context (jsdom tests) — strokes are tracked in state either
 * way, only the ink needs a canvas.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Undo2, Trash2 } from 'lucide-react'
import type { Point, Stroke } from '../data/api/handwriting'

interface DrawPadProps {
  strokes: Stroke[]
  onChange: (strokes: Stroke[]) => void
  /** Called after each committed stroke — recognition hooks in here. */
  onStrokeCommitted?: () => void
}

export function DrawPad({ strokes, onChange, onStrokeCommitted }: DrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [active, setActive] = useState<Stroke | null>(null)
  const drawingRef = useRef(false)

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
  }, [strokes, active])

  useEffect(() => {
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [draw])

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  return (
    <div className="draw-pad">
      <canvas
        className="draw-pad__canvas"
        ref={canvasRef}
        aria-label="Character drawing area"
        role="img"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drawingRef.current = true
          setActive([pointAt(e)])
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current) return
          const p = pointAt(e)
          setActive((prev) => (prev ? [...prev, p] : [p]))
        }}
        onPointerUp={(e) => {
          if (!drawingRef.current) return
          drawingRef.current = false
          const stroke = active ?? [pointAt(e)]
          setActive(null)
          // A bare tap is a stray dot, not a stroke — drop it.
          if (stroke.length < 2) return
          onChange([...strokes, stroke])
          onStrokeCommitted?.()
        }}
        onPointerCancel={() => {
          drawingRef.current = false
          setActive(null)
        }}
      />
      <div className="draw-pad__actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => onChange(strokes.slice(0, -1))}
          disabled={!strokes.length}
          aria-label="Undo stroke"
        >
          <Undo2 size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onChange([])}
          disabled={!strokes.length}
          aria-label="Clear drawing"
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
        <span className="faint text-sm">
          {strokes.length} {strokes.length === 1 ? 'stroke' : 'strokes'}
        </span>
      </div>
    </div>
  )
}
