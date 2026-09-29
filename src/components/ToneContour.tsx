import { useEffect, useRef, type RefObject } from 'react'
import type { Frame } from '../utils/scoring'
import {
  compareContours,
  CONTOUR_STEPS,
  targetSamples,
  toContour,
  type Divergence,
} from '../utils/toneContour'
import type { Tone } from '../types'

interface ToneContourProps {
  targetTone: Tone
  /** Live frame buffer read every animation frame while recording. */
  framesRef: RefObject<Frame[]>
  recording: boolean
  baseFreq: number | null
  /** Final user contour (already normalized) from the last attempt, if any. */
  final: number[] | null
  height?: number
}

const GRID = '#334155'
const USER_LINE = '#F8FAFC'
const LIVE_LINE = '#06D6A0'
const ZONE_FILL = 'rgba(252, 163, 17, 0.14)'

/**
 * Live pitch-contour canvas: target template (dashed, tone color) vs the
 * user's speaker-relative contour (solid). Redraws on requestAnimationFrame
 * from the mutable frame buffer — no React re-render per frame, no smoothing
 * in the capture path, so graph latency stays at capture latency.
 */
export function ToneContour({
  targetTone,
  framesRef,
  recording,
  baseFreq,
  final,
  height = 220,
}: ToneContourProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef({ targetTone, framesRef, recording, baseFreq, final, height })

  // Keep the rAF loop reading fresh props without restarting it every render.
  useEffect(() => {
    propsRef.current = { targetTone, framesRef, recording, baseFreq, final, height }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let width = canvas.parentElement?.clientWidth || 320
    let raf = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = canvas.parentElement?.clientWidth || width
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(propsRef.current.height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${propsRef.current.height}px`
    }

    const draw = () => {
      const {
        targetTone: tone,
        framesRef: frames,
        recording: isRecording,
        baseFreq: base,
        final: finalContour,
        height: h,
      } = propsRef.current

      let ctx: CanvasRenderingContext2D | null = null
      try {
        ctx = canvas.getContext('2d')
      } catch {
        ctx = null // headless test environment
      }
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, h)

      const target = targetSamples(tone, CONTOUR_STEPS)

      let user: number[] = []
      let aligned: number[] | null = null
      let divergence: Divergence | null = null

      if (isRecording) {
        const freqs = frames.current.map(f => f.freq)
        user = toContour(freqs, base ?? undefined, CONTOUR_STEPS)
      } else if (finalContour && finalContour.length > 0) {
        divergence = compareContours(finalContour, tone)
        aligned = divergence?.aligned ?? finalContour
        user = aligned
      }

      const values = [...target, ...user]
      const lo = Math.min(-7, ...values) - 1
      const hi = Math.max(7, ...values) + 1

      const x = (i: number) => (i / (CONTOUR_STEPS - 1)) * (width - 12) + 6
      const y = (semitones: number) => h - 14 - ((semitones - lo) / (hi - lo)) * (h - 24)

      const plot = (points: number[], color: string, dashed: boolean) => {
        ctx!.strokeStyle = color
        ctx!.lineWidth = dashed ? 1.5 : 2.5
        ctx!.setLineDash(dashed ? [6, 5] : [])
        ctx!.beginPath()
        points.forEach((v, i) => (i === 0 ? ctx!.moveTo(x(i), y(v)) : ctx!.lineTo(x(i), y(v))))
        ctx!.stroke()
        ctx!.setLineDash([])
      }

      // Zone separators (thirds) + zero line.
      ctx.strokeStyle = GRID
      ctx.lineWidth = 1
      const third = Math.max(1, Math.floor((CONTOUR_STEPS - 1) / 3))
      for (const boundary of [third, third * 2]) {
        ctx.beginPath()
        ctx.moveTo(x(boundary), 4)
        ctx.lineTo(x(boundary), h - 10)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.setLineDash([2, 4])
      ctx.moveTo(6, y(0))
      ctx.lineTo(width - 6, y(0))
      ctx.stroke()
      ctx.setLineDash([])

      // Worst-zone highlight after an attempt.
      if (divergence) {
        const span = Math.max(1, Math.floor(CONTOUR_STEPS / 3))
        const from =
          divergence.zone === 'start' ? 0 : divergence.zone === 'mid' ? span : span * 2
        ctx.fillStyle = ZONE_FILL
        ctx.fillRect(x(from), 4, x(Math.min(CONTOUR_STEPS - 1, from + span)) - x(from), h - 14)
      }

      plot(target, getToneColor(tone), true)
      if (user.length > 1) plot(user, isRecording ? LIVE_LINE : USER_LINE, false)

      // Marker at the single largest error once scored.
      if (divergence && divergence.errors.length > 0) {
        const idx = divergence.worstIndex
        ctx.fillStyle = '#FCA311'
        ctx.beginPath()
        ctx.arc(x(idx), y(user[idx]), 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div
      className="relative bg-gray-900 rounded p-2"
      data-testid="tone-contour"
      style={{ height: `${height}px` }}
    >
      <canvas ref={canvasRef} data-testid="tone-contour-canvas" />
      <span className="absolute top-2 left-3 text-[10px] uppercase tracking-wide text-gray-500">
        semitones · target (dashed) vs you (solid)
      </span>
    </div>
  )
}

function getToneColor(tone: Tone): string {
  if (typeof window === 'undefined') return '#FFFFFF'
  try {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--tone-${tone}`)
      .trim()
    return value || '#FFFFFF'
  } catch {
    return '#FFFFFF'
  }
}
