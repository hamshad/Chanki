/**
 * Handwriting recognition for the Dictionary draw pad.
 *
 * Candidates come from a build-time bundle of hanzi-writer stroke medians
 * (`/assets/deck/index/handwriting.json`, built by `npm run data:handwriting`)
 * covering the HSK character set. Matching is deliberately lightweight —
 * the kind a Chinese keyboard does while you write:
 *
 *   1. only characters with exactly the drawn stroke count can match,
 *   2. both sides are normalised into the same unit box (aspect kept),
 *   3. every stroke is arc-length resampled and compared point-by-point
 *      (forward or reversed, so stroke direction mistakes don't sink it).
 *
 * No model, no network per stroke — one lazy fetch, then pure maths.
 */

export interface Point {
  x: number
  y: number
}

export type Stroke = Point[]

/** char → strokes, each a flat `[x,y,x,y,…]` integer list (0–1024 space). */
export interface HandwritingIndex {
  [char: string]: number[][]
}

/** Points per stroke used for comparison — enough to tell shapes apart. */
const SAMPLES = 6

let hwPromise: Promise<HandwritingIndex> | null = null

export function loadHandwriting(): Promise<HandwritingIndex> {
  hwPromise ??= fetch('/assets/deck/index/handwriting.json').then((res) => {
    if (!res.ok) throw new Error(`handwriting index unavailable (${res.status})`)
    return res.json() as Promise<HandwritingIndex>
  })
  hwPromise.catch(() => {
    hwPromise = null
  })
  return hwPromise
}

/**
 * Translate strokes so the bounding box starts at the origin, then scale by
 * the larger bbox side — the written character keeps its aspect ratio and
 * relative stroke positions, whatever size or corner of the pad it was drawn.
 */
export function normalizeStrokes(strokes: Stroke[]): Stroke[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1
  return strokes.map((s) => s.map((p) => ({ x: (p.x - minX) / span, y: (p.y - minY) / span })))
}

/** Resample a stroke to exactly `k` points, evenly spaced along its length. */
export function resample(stroke: Stroke, k = SAMPLES): Point[] {
  if (stroke.length === 0) return []
  if (stroke.length === 1 || k === 1) return Array.from({ length: k }, () => stroke[0])

  const lengths: number[] = [0]
  let total = 0
  for (let i = 1; i < stroke.length; i++) {
    total += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y)
    lengths.push(total)
  }
  if (total === 0) return Array.from({ length: k }, () => stroke[0])

  const out: Point[] = []
  let seg = 0
  for (let i = 0; i < k; i++) {
    const target = (total * i) / (k - 1)
    while (seg < lengths.length - 2 && lengths[seg + 1] < target) seg++
    const segLen = lengths[seg + 1] - lengths[seg] || 1
    const t = (target - lengths[seg]) / segLen
    out.push({
      x: stroke[seg].x + (stroke[seg + 1].x - stroke[seg].x) * t,
      y: stroke[seg].y + (stroke[seg + 1].y - stroke[seg].y) * t,
    })
  }
  return out
}

function meanPointDistance(a: Point[], b: Point[]): number {
  let total = 0
  for (let i = 0; i < a.length; i++) total += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
  return total / a.length
}

/** Distance between two normalised strokes — direction-insensitive. */
function strokeDistance(a: Stroke, b: Stroke): number {
  const ra = resample(a)
  const rb = resample(b)
  const reversed = [...rb].reverse()
  return Math.min(meanPointDistance(ra, rb), meanPointDistance(ra, reversed))
}

function toStrokes(flat: number[][]): Stroke[] {
  return flat.map((nums) => {
    const stroke: Stroke = []
    for (let i = 0; i + 1 < nums.length; i += 2) stroke.push({ x: nums[i], y: nums[i + 1] })
    return stroke
  })
}

export interface HandwritingHit {
  char: string
  /** Mean point distance — lower matches the drawing better. */
  score: number
}

// Normalise once per index — recognition runs after every stroke.
const normalizedCache = new WeakMap<HandwritingIndex, { char: string; strokes: Stroke[] }[]>()

function candidatesOf(index: HandwritingIndex) {
  let cached = normalizedCache.get(index)
  if (!cached) {
    cached = Object.entries(index).map(([char, flat]) => ({
      char,
      strokes: normalizeStrokes(toStrokes(flat)),
    }))
    normalizedCache.set(index, cached)
  }
  return cached
}

/**
 * Top candidates for the drawn strokes. Exact stroke-count match first, then
 * ascending shape distance. Empty drawing → no suggestions.
 */
export function recognizeHandwriting(
  drawn: Stroke[],
  index: HandwritingIndex,
  limit = 8,
): HandwritingHit[] {
  if (!drawn.length) return []
  const normalizedDrawn = normalizeStrokes(drawn)
  const hits: HandwritingHit[] = []

  for (const candidate of candidatesOf(index)) {
    if (candidate.strokes.length !== drawn.length) continue
    let total = 0
    for (let i = 0; i < normalizedDrawn.length; i++) {
      total += strokeDistance(normalizedDrawn[i], candidate.strokes[i])
    }
    hits.push({ char: candidate.char, score: total / drawn.length })
  }

  hits.sort((a, b) => a.score - b.score)
  return hits.slice(0, limit)
}
