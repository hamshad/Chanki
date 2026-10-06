import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  normalizeStrokes,
  rasterize,
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
  it('fits the bbox into the unit square', () => {
    const [n] = normalizeStrokes([line(10, 20, 110, 20)])
    expect(n[0].x).toBeCloseTo(0)
    expect(n[0].y).toBeCloseTo(0)
    expect(n[n.length - 1].x).toBeCloseTo(1)
    expect(n[n.length - 1].y).toBeCloseTo(0)
  })

  it('scales each axis independently — proportion drift cancels out', () => {
    // A box drawn 25% taller than canonical still maps to the same square,
    // keeping relative stroke positions inside the cell.
    const short = normalizeStrokes([line(0, 0, 100, 0), line(50, 0, 50, 80)])
    const tall = normalizeStrokes([line(0, 0, 100, 0), line(50, 0, 50, 100)])
    expect(short[1][0].x).toBeCloseTo(0.5)
    expect(tall[1][0].x).toBeCloseTo(0.5)
    expect(short[1][short[1].length - 1].y).toBeCloseTo(1)
    expect(tall[1][tall[1].length - 1].y).toBeCloseTo(1)
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
    '十': { s: [flat(0, 500, 1000, 500), flat(500, 0, 500, 1000)] },
    '口': {
      s: [flat(0, 0, 0, 1000), flat(0, 0, 1000, 0), flat(0, 1000, 1000, 1000)],
    },
  }

  it('returns nothing for an empty drawing', () => {
    expect(recognizeHandwriting([], index)).toEqual([])
  })

  it('matches the drawn shape, indifferent to scale and offset', () => {
    // Same cross, drawn small in the corner of a phone-sized pad.
    const drawn: Stroke[] = [line(100, 150, 180, 150), line(140, 110, 140, 190)]
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

  it('tolerates non-canonical stroke order', () => {
    // Writer draws the vertical before the horizontal — canonical order
    // flipped. Greedy pairing must not care.
    const drawn: Stroke[] = [line(140, 110, 140, 190), line(100, 150, 180, 150)]
    const hits = recognizeHandwriting(drawn, index)
    expect(hits[0].char).toBe('十')
  })

  it('suggests merged-stroke (running script) drawings despite count drift', () => {
    // 口 drawn with two strokes instead of three: two canonical strokes
    // dragged together as one polyline. Strict count matching would show
    // nothing — tolerance must keep 口 on the board.
    const merged: Stroke[] = [
      [P(0, 0), P(0, 500), P(0, 1000), P(500, 1000), P(1000, 1000)], // left + bottom
      line(0, 0, 1000, 0), // top
    ]
    const hits = recognizeHandwriting(merged, index, 8)
    expect(hits.map((h) => h.char)).toContain('口')
  })

  it('breaks shape ties toward common characters', () => {
    const tied: HandwritingIndex = {
      rare: { s: [flat(0, 500, 1000, 500)], f: 0.05 },
      common: { s: [flat(0, 500, 1000, 500)], f: 0.95 },
    }
    const hits = recognizeHandwriting([line(10, 50, 90, 50)], tied)
    expect(hits[0].char).toBe('common')
  })

  it('respects the result limit', () => {
    const many: HandwritingIndex = {}
    for (let i = 0; i < 20; i++) many[`c${i}`] = { s: [flat(0, 0, 1000, 1000)], f: 0.5 }
    const hits = recognizeHandwriting([line(0, 0, 100, 100)], many, 5)
    expect(hits).toHaveLength(5)
    // Sorted ascending by distance.
    const scores = hits.map((h) => h.score)
    expect([...scores].sort((a, b) => a - b)).toEqual(scores)
  })
})

describe('stroke order invariance', () => {
  const index: HandwritingIndex = {
    '口': {
      s: [flat(0, 0, 0, 1000), flat(0, 0, 1000, 0), flat(0, 1000, 1000, 1000)],
    },
    '十': { s: [flat(0, 500, 1000, 500), flat(500, 0, 500, 1000)] },
  }

  it('every permutation of the drawn strokes scores identically', () => {
    // Greedy pairing considers all stroke pairs regardless of input order,
    // so the whole ranking must be permutation-invariant — a writer who
    // starts with any stroke gets the same suggestions.
    const drawn: Stroke[] = [
      line(100, 110, 100, 190), // left
      line(100, 110, 180, 110), // top
      line(100, 190, 180, 190), // bottom
    ]
    const base = recognizeHandwriting(drawn, index, 8)
    const perms: number[][] = []
    for (const a of [0, 1, 2])
      for (const b of [0, 1, 2])
        for (const c of [0, 1, 2]) {
          const p = [a, b, c]
          if (new Set(p).size === 3) perms.push(p)
        }
    expect(perms).toHaveLength(6)
    for (const p of perms) {
      expect(recognizeHandwriting(p.map((i) => drawn[i]), index, 8)).toEqual(base)
    }
  })
})

describe('index orientation', () => {
  it('medians are y-down like canvas input — not the raw y-up source', () => {
    // hanzi-writer-data is stored y-up (the library flips it when drawing).
    // If the build ever stops flipping, every template matches upside down
    // and real drawings fall out of the top 8. 人 is the canary: its apex
    // must sit at the TOP centre, legs at the BOTTOM corners.
    const index: HandwritingIndex = JSON.parse(
      fs.readFileSync('public/assets/deck/index/handwriting.json', 'utf8'),
    )
    const strokes: Stroke[] = index['人'].s.map((nums) => {
      const stroke: Stroke = []
      for (let i = 0; i + 1 < nums.length; i += 2) stroke.push({ x: nums[i], y: nums[i + 1] })
      return stroke
    })
    const grid = rasterize(normalizeStrokes(strokes))
    const cell = (row: number, col: number) => grid[row * 16 + col] === 1
    const band = (r0: number, r1: number, c0: number, c1: number) => {
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (cell(r, c)) return true
      return false
    }
    expect(band(0, 2, 6, 9)).toBe(true) // apex, top centre
    expect(band(13, 15, 0, 2)).toBe(true) // 丿 leg, bottom left
    expect(band(13, 15, 13, 15)).toBe(true) // ㇏ leg, bottom right
    expect(band(0, 2, 0, 1)).toBe(false) // top corners empty when upright
  })
})
