/**
 * Loading surface driven by Conway's Game of Life.
 *
 * Renders a live automaton on a canvas instead of a shimmering skeleton. The
 * board starts from an asymmetric soup plus three still-life shapes, so it
 * keeps moving for as long as the load takes — no frozen frame, no restart,
 * no "is it stuck?" moment.
 */
import { useEffect, useRef, useState } from 'react'
import { RULES, population, seedGrid, step, tableFor } from './life'

const CELL = 10

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

interface LifeLoaderProps {
  /** Milliseconds between generations. Lower = faster churn. */
  intervalMs?: number
  /** Deterministic seed; bump it to start a different soup. */
  seed?: number
  /** Rule id from RULES. Omit to draw a random variant on every mount. */
  ruleId?: string
  className?: string
  label?: string
}

/**
 * Live Life board. Reduced-motion users get one static generation instead of
 * an animation — the loader still reads as a board, it just does not move.
 */
export function LifeLoader({
  intervalMs = 90,
  seed = 1337,
  ruleId,
  className,
  label = 'Loading',
}: LifeLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Chosen once per mount, so re-renders mid-load never restart the board.
  const [activeRule] = useState(() => ruleId ?? RULES[Math.floor(Math.random() * RULES.length)].id)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return // jsdom / no canvas support — nothing to animate

    const table = tableFor(activeRule)
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    let width = 0
    let height = 0
    let cols = 0
    let rows = 0
    let grid: Uint8Array = new Uint8Array(0)
    let buffer: Uint8Array = new Uint8Array(0)

    const measure = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(80, Math.round(rect.width || 320))
      height = Math.max(80, Math.round(rect.height || 220))
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Full-bleed board: the torus seam sits at the container edge, so
      // patterns visibly wrap instead of stopping in a margin.
      cols = Math.ceil(width / CELL)
      rows = Math.ceil(height / CELL)
    }

    const reseed = (nextSeed: number) => {
      grid = seedGrid(cols, rows, nextSeed)
      buffer = new Uint8Array(grid.length)
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      // One flat opaque fill, no gaps and no glow halo — neighbouring live
      // cells merge into continuous blobs rather than a bright box grid.
      ctx.fillStyle = 'rgb(63 146 126)'
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (grid[y * cols + x]) ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
        }
      }
    }

    const advance = () => {
      const next = step(grid, buffer, cols, rows, table)
      buffer = grid
      grid = next
      // Sparse rules can empty a small board — restart rather than sit dead.
      if (population(grid) < 3) reseed(seed + Math.floor(grid.length / 7) + 1)
      draw()
    }

    measure()
    reseed(seed)
    draw()

    if (prefersReducedMotion()) return

    const timer = window.setInterval(advance, intervalMs)
    const onResize = () => {
      const before = `${cols}x${rows}`
      measure()
      if (`${cols}x${rows}` === before) return
      reseed(seed)
      draw()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [intervalMs, seed, activeRule])

  return (
    <div
      className={`life-loader${className ? ` ${className}` : ''}`}
      data-rule={activeRule}
      role="img"
      aria-label={label}
    >
      <canvas className="life-loader__canvas" ref={canvasRef} />
    </div>
  )
}
