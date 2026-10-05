import { describe, it, expect } from 'vitest'
import {
  normalizeStrokes,
  resample,
  recognizeHandwriting,
  type HandwritingIndex,
  type Stroke,
} from './handwriting'

const P = (x: number, y: number) => ({ x, y })

function line(x1: number, y1: number, x2: number, y2: number, n = 5): Stroke {
  return Array.from({ length: n }, (_, i) =>
    P(x1 + ((x2 - x1) * i) / (n - 1), y1 + ((y2 - y1) * i) / (n - 1)),
  )
}

/** Flat `[x,y,…]` helper matching the index file format. */
function flat(...nums: number[]): number[] {
  return nums
}

describe('normalizeStrokes', () => {
  it('moves the bbox to the origin and scales the larger side to 1', () => {
    const [n] = normalizeStrokes([line(10, 20, 110, 20)])
    expect(n[0].x).toBeCloseTo(0)
    expect(n[0].y).toBeCloseTo(0)
    expect(n[n.length - 1].x).toBeCloseTo(1)
    expect(n[n.length - 1].y).toBeCloseTo(0)
  })

  it('keeps relative stroke positions (aspect ratio preserved)', () => {
    // A vertical stroke crossing the middle of a 100-wide box stays at x=.5.
    const [, vertical] = normalizeStrokes([line(0, 0, 100, 0), line(50, 0, 50, 80)])
    expect(vertical[0].x).toBeCloseTo(0.5)
    expect(vertical[vertical.length - 1].y).toBeCloseTo(0.8)
  })

  it('survives a zero-size drawing', () => {
    const [n] = normalizeStrokes([[P(5, 5)]])
    expect(n[0].x).toBe(0)
    expect(n[0].y).toBe(0)
  })
})

describe('resample', () => {
  it('returns exactly k points with endpoints preserved', () => {
    const pts = resample(line(0, 0, 10, 0), 6)
    expect(pts).toHaveLength(6)
    expect(pts[0]).toEqual(P(0, 0))
    expect(pts[5].x).toBeCloseTo(10)
    expect(pts.every((p) => p.y === 0)).toBe(true)
  })

  it('handles a single-point stroke', () => {
    const pts = resample([P(3, 4)], 6)
    expect(pts).toHaveLength(6)
    expect(pts.every((p) => p.x === 3 && p.y === 4)).toBe(true)
  })
})

describe('recognizeHandwriting', () => {
  // A cross (2 strokes) and a box (3 strokes), in index coordinates.
  const index: HandwritingIndex = {
    '十': [flat(0, 500, 1000, 500), flat(500, 0, 500, 1000)],
    '口': [flat(0, 0, 0, 1000), flat(0, 0, 1000, 0), flat(0, 1000, 1000, 1000)],
  }

  it('returns nothing for an empty drawing', () => {
    expect(recognizeHandwriting([], index)).toEqual([])
  })

  it('matches the drawn shape, indifferent to scale and offset', () => {
    // Same cross, drawn small in the corner of a phone-sized pad.
    const drawn: Stroke[] = [
      line(100, 150, 180, 150),
      line(140, 110, 140, 190),
    ]
    const hits = recognizeHandwriting(drawn, index)
    expect(hits[0].char).toBe('十')
    expect(hits[0].score).toBeLessThan(0.1)
  })

  it('tolerates reversed stroke direction', () => {
    const drawn: Stroke[] = [
      line(100, 150, 180, 150).reverse(),
      line(140, 110, 140, 190).reverse(),
    ]
    const hits = recognizeHandwriting(drawn, index)
    expect(hits[0].char).toBe('十')
  })

  it('never suggests characters whose stroke count differs', () => {
    const drawn: Stroke[] = [line(10, 10, 90, 10), line(50, 10, 50, 90)]
    const hits = recognizeHandwriting(drawn, index)
    expect(hits.map((h) => h.char)).not.toContain('口')
    expect(hits.every((h) => h.char === '十')).toBe(true)
  })

  it('respects the result limit', () => {
    const many: HandwritingIndex = {}
    for (let i = 0; i < 20; i++) many[`c${i}`] = [flat(0, 0, 1000, 1000)]
    const hits = recognizeHandwriting([line(0, 0, 100, 100)], many, 5)
    expect(hits).toHaveLength(5)
    // Sorted ascending by distance.
    const scores = hits.map((h) => h.score)
    expect([...scores].sort((a, b) => a - b)).toEqual(scores)
  })
})
