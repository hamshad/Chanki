/**
 * Handwriting recognition for the Dictionary draw pad.
 *
 * Candidates come from a build-time bundle of hanzi-writer stroke medians
 * (`/assets/deck/index/handwriting.json`, built by `npm run data:handwriting`)
 * covering the HSK character set, each with a frequency prior.
 *
 * A single matcher — stroke shape alone — fails real writing: people draw
 * strokes in a different order than the canonical model, merge strokes when
 * writing fast (running script), or land strokes slightly off the box. So
 * every drawing scores on THREE signals:
 *
 *   1. silhouette — both sides rasterised into the same unit box, compared
 *      by symmetric chamfer distance on a 16×16 grid: forgiving of sub-cell
 *      placement (hand-drawn lines never land on the model's cells), sharp
 *      on structure; survives cursive, because the overall shape barely
 *      changes when strokes merge;
 *   2. strokes — greedy one-to-one pairing of strokes (order-insensitive,
 *      direction-insensitive, endpoints weighted), with a per-missing-stroke
 *      toll so count drift costs, but does not disqualify;
 *   3. frequency — common characters win ties.
 *
 * No model, no network per stroke — one lazy fetch, then pure maths.
 */

export interface Point {
  x: number
  y: number
}

export type Stroke = Point[]

export interface HandwritingChar {
  /** Strokes as flat `[x,y,x,y,…]` integer lists (0–1024 space). */
  s: number[][]
  /** Frequency rank 0–1, 1 = commonest (tie breaker). */
  f?: number
}

export interface HandwritingIndex {
  [char: string]: HandwritingChar
}

/** Points per stroke used for comparison — enough to tell shapes apart. */
const SAMPLES = 6
/** Silhouette grid side; 16×16 reads sloppy writing without overfitting. */
const GRID = 16
const ENDPOINT_WEIGHT = 1.75
/** Distance charged for a stroke that found no partner (count drift). */
const UNMATCHED_STROKE = 0.15
/** Flat toll per extra/missing stroke on top of the pairing toll. */
const COUNT_PENALTY = 0.017
const W_STROKE = 0.45
const FREQ_WEIGHT = 0.04

const SAMPLE_WEIGHTS = (() => {
  const w = new Array<number>(SAMPLES).fill(1)
  w[0] = ENDPOINT_WEIGHT
  w[SAMPLES - 1] = ENDPOINT_WEIGHT
  return w
})()
const WEIGHT_SUM = SAMPLE_WEIGHTS.reduce((a, b) => a + b, 0)

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
 * Square-normalise: bbox to the origin, each axis scaled into [0,1]
 * independently. Characters are written in square cells, so squashing both
 * the drawing and the candidate into the same square cancels proportion
 * differences — a writer who runs tall or wide still lands on the target.
 * Relative stroke positions inside the cell are preserved.
 *
 * Near-one-dimensional shapes are the exception: a straight 一's axis has
 * almost no span, so scaling by it would amplify the median's hand-wobble
 * to full cell height (and vice versa for a lone vertical). Flat axes
 * scale by the long axis instead.
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
  const spanX = maxX - minX
  const spanY = maxY - minY
  const FLAT = 0.15
  const effX = spanX < FLAT * spanY ? spanY || 1 : spanX || spanY || 1
  const effY = spanY < FLAT * spanX ? spanX || 1 : spanY || spanX || 1
  return strokes.map((s) => s.map((p) => ({ x: (p.x - minX) / effX, y: (p.y - minY) / effY })))
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

/** Rasterise normalised strokes onto the occupancy grid (the silhouette). */
export function rasterize(strokes: Stroke[]): Uint8Array {
  const grid = new Uint8Array(GRID * GRID)
  const mark = (x: number, y: number) => {
    const gx = Math.min(GRID - 1, Math.max(0, Math.floor(x * GRID)))
    const gy = Math.min(GRID - 1, Math.max(0, Math.floor(y * GRID)))
    grid[gy * GRID + gx] = 1
  }
  for (const stroke of strokes) {
    if (stroke.length === 1) {
      mark(stroke[0].x, stroke[0].y)
      continue
    }
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1]
      const b = stroke[i]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      const steps = Math.max(1, Math.ceil((len * GRID) / 0.5))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        mark(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
      }
    }
  }
  return grid
}

/** Weighted, direction-insensitive distance between two resampled strokes. */
function strokeDistance(a: Stroke, b: Stroke): number {
  let forward = 0
  let reversed = 0
  const last = a.length - 1
  for (let i = 0; i < a.length; i++) {
    const w = SAMPLE_WEIGHTS[i]
    forward += w * Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
    reversed += w * Math.hypot(a[i].x - b[last - i].x, a[i].y - b[last - i].y)
  }
  return Math.min(forward, reversed) / WEIGHT_SUM
}

/**
 * Pair drawn strokes with candidate strokes greedily (cheapest pair first,
 * no reuse) — order-insensitive, so a writer who flips canonical stroke order
 * still matches. Unpaired strokes pay UNMATCHED_STROKE each.
 */
function pairStrokeScore(drawn: Stroke[], candidate: Stroke[]): number {
  const m = drawn.length
  const n = candidate.length
  if (!m || !n) return UNMATCHED_STROKE
  const pairs: { i: number; j: number; d: number }[] = []
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) pairs.push({ i, j, d: strokeDistance(drawn[i], candidate[j]) })
  }
  pairs.sort((a, b) => a.d - b.d)
  const usedI = new Set<number>()
  const usedJ = new Set<number>()
  let sum = 0
  let matched = 0
  const want = Math.min(m, n)
  for (const p of pairs) {
    if (usedI.has(p.i) || usedJ.has(p.j)) continue
    usedI.add(p.i)
    usedJ.add(p.j)
    sum += p.d
    matched++
    if (matched === want) break
  }
  const unpaired = Math.max(m, n) - matched
  return (sum + UNMATCHED_STROKE * unpaired) / Math.max(m, n)
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
  /** Combined match cost — lower matches the drawing better. */
  score: number
}

interface Candidate {
  char: string
  sampled: Stroke[]
  grid: Uint8Array
  dt: Float32Array
  count: number
  freq: number
}

// Pre-normalise, pre-sample and rasterise once per index — recognition runs
// after every stroke and must stay under a frame.
const candidateCache = new WeakMap<HandwritingIndex, Candidate[]>()

function candidatesOf(index: HandwritingIndex): Candidate[] {
  let cached = candidateCache.get(index)
  if (!cached) {
    cached = Object.entries(index).map(([char, data]) => {
      const strokes = normalizeStrokes(toStrokes(data.s))
      const grid = rasterize(strokes)
      return {
        char,
        sampled: strokes.map((s) => resample(s)),
        grid,
        dt: distanceTransform(grid),
        count: strokes.length,
        freq: data.f ?? 0.5,
      }
    })
    candidateCache.set(index, cached)
  }
  return cached
}

/**
 * Chamfer distance transform: per cell, distance to the nearest inked cell
 * (two raster passes, 3×3 neighbourhood). Used symmetrically on both
 * silhouettes — smooth, so a line a hair off the box edge or a median that
 * sits two cells inside both read as "the same line", while interior
 * structure (目's bars, 门's top gap) still counts against you.
 */
export function distanceTransform(grid: Uint8Array): Float32Array {
  const INF = GRID * 4
  const D = new Float32Array(GRID * GRID)
  for (let i = 0; i < D.length; i++) D[i] = grid[i] ? 0 : INF
  const ORTHO = 1
  const DIAG = 1.414
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x
      if (D[i] === 0) continue
      let v = D[i]
      if (y > 0) {
        if (x > 0) v = Math.min(v, D[i - GRID - 1] + DIAG)
        v = Math.min(v, D[i - GRID] + ORTHO)
        if (x < GRID - 1) v = Math.min(v, D[i - GRID + 1] + DIAG)
      }
      if (x > 0) v = Math.min(v, D[i - 1] + ORTHO)
      D[i] = v
    }
  }
  for (let y = GRID - 1; y >= 0; y--) {
    for (let x = GRID - 1; x >= 0; x--) {
      const i = y * GRID + x
      if (D[i] === 0) continue
      let v = D[i]
      if (y < GRID - 1) {
        if (x < GRID - 1) v = Math.min(v, D[i + GRID + 1] + DIAG)
        v = Math.min(v, D[i + GRID] + ORTHO)
        if (x > 0) v = Math.min(v, D[i + GRID - 1] + DIAG)
      }
      if (x < GRID - 1) v = Math.min(v, D[i + 1] + ORTHO)
      D[i] = v
    }
  }
  return D
}

/** Beyond this many cells further ink is irrelevant. */
const GRID_CAP = 4

/** Mean distance each silhouette's ink sits from the other's, symmetric. */
function gridScore(gA: Uint8Array, dA: Float32Array, gB: Uint8Array, dB: Float32Array): number {
  let sumA = 0
  let nA = 0
  let sumB = 0
  let nB = 0
  for (let i = 0; i < gA.length; i++) {
    if (gA[i]) {
      sumA += Math.min(dB[i], GRID_CAP)
      nA++
    }
    if (gB[i]) {
      sumB += Math.min(dA[i], GRID_CAP)
      nB++
    }
  }
  if (!nA || !nB) return 1
  return (sumA / nA + sumB / nB) / (2 * GRID_CAP)
}

/**
 * Top candidates for the drawn strokes. Silhouette + greedy stroke pairing
 * + count tolerance + frequency prior — running-script drawings (merged
 * strokes) still surface, because the silhouette carries them.
 */
export function recognizeHandwriting(
  drawn: Stroke[],
  index: HandwritingIndex,
  limit = 8,
): HandwritingHit[] {
  if (!drawn.length) return []
  const normalized = normalizeStrokes(drawn)
  const sampled = normalized.map((s) => resample(s))
  const grid = rasterize(normalized)
  const dt = distanceTransform(grid)
  const hits: HandwritingHit[] = []

  for (const c of candidatesOf(index)) {
    const shape = pairStrokeScore(sampled, c.sampled)
    // As the stroke count drifts (running script merges strokes) trust the
    // silhouette more and the pairing less — the overall shape survives
    // cursive even when the stroke structure does not.
    const drift = Math.abs(drawn.length - c.count) / Math.max(drawn.length, c.count)
    const wStroke = W_STROKE * (1 - drift)
    const score =
      wStroke * shape +
      (1 - wStroke) * gridScore(grid, dt, c.grid, c.dt) +
      COUNT_PENALTY * Math.abs(drawn.length - c.count) +
      FREQ_WEIGHT * (1 - c.freq)
    hits.push({ char: c.char, score })
  }

  hits.sort((a, b) => a.score - b.score)
  return hits.slice(0, limit)
}
