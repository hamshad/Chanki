/**
 * Conway's Game of Life — the automaton behind the loading surface.
 *
 * Rules are selectable in B/S notation. Conway's Life is the default; the
 * others are variants that oscillate or grow so the surface never empties.
 * Pure grid maths — no canvas, no DOM, so it is directly testable.
 */

export interface Rule {
  id: string
  label: string
  /** Neighbour counts that create a live cell. */
  birth: number[]
  /** Neighbour counts that keep a live cell alive. */
  survival: number[]
}

/** B3/S23 — the original. */
export const CONWAY: Rule = { id: 'conway', label: "Conway's Life", birth: [3], survival: [2, 3] }

/** B36/S23 — HighLife: replicators make it busier than Life. */
export const HIGHLIFE: Rule = { id: 'highlife', label: 'HighLife', birth: [3, 6], survival: [2, 3] }

/** B3/S123 — Maze: snaky growth that keeps unspooling. */
export const MAZE: Rule = { id: 'maze', label: 'Maze', birth: [3], survival: [1, 2, 3] }

/** B3678/S34678 — Day & Night: two dense, opposite phases. */
export const DAY_AND_NIGHT: Rule = {
  id: 'daynight',
  label: 'Day & Night',
  birth: [3, 6, 7, 8],
  survival: [3, 4, 6, 7, 8],
}

/** B2/S — Seeds: dead cells only, so it can never stall. */
export const SEEDS: Rule = { id: 'seeds', label: 'Seeds', birth: [2], survival: [] }

/** B3/S45678 — Coral: dense growth that creeps over the whole board. */
export const CORAL: Rule = { id: 'coral', label: 'Coral', birth: [3], survival: [4, 5, 6, 7, 8] }

export const RULES: Rule[] = [CONWAY, HIGHLIFE, MAZE, DAY_AND_NIGHT, SEEDS, CORAL]

/**
 * One lookup table per rule: index = neighbour count, high bit = born,
 * low bit = survives. The hot loop then costs a single array read per cell.
 */
function buildTable(rule: Rule): Uint8Array {
  const table = new Uint8Array(9)
  for (let n = 0; n <= 8; n++) {
    table[n] = ((rule.birth.includes(n) ? 1 : 0) << 1) | (rule.survival.includes(n) ? 1 : 0)
  }
  return table
}

const TABLES = new Map<string, Uint8Array>(RULES.map(rule => [rule.id, buildTable(rule)]))

export function tableFor(ruleId: string): Uint8Array {
  return TABLES.get(ruleId) ?? TABLES.get(CONWAY.id)!
}

/** xorshift32 — deterministic, so screenshots and tests stay stable. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1000) / 1000
  }
}

/**
 * Seed a board that is guaranteed to have structure: an asymmetric soup across
 * the middle band, plus a glider, a block and a blinker so even sparse rules
 * have something to chew on from generation zero.
 */
export function seedGrid(width: number, height: number, seed: number): Uint8Array {
  const grid = new Uint8Array(width * height)
  const rand = makeRandom(seed)

  for (let y = Math.floor(height / 3); y < Math.ceil((height * 2) / 3); y++) {
    for (let x = 1; x < width - 1; x++) {
      if (rand() < 0.26) grid[y * width + x] = 1
    }
  }

  const stamp = (cells: [number, number][]) => {
    for (const [dx, dy] of cells) {
      const x = ((dx % width) + width) % width
      const y = ((dy % height) + height) % height
      grid[y * width + x] = 1
    }
  }

  stamp([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) // glider
  stamp([[0, 0], [1, 0], [0, 1], [1, 1]]) // block
  stamp([[0, 0], [1, 0], [2, 0]]) // blinker
  stamp([
    // L-shaped eater 1, bottom-right corner.
    [width - 4, height - 3],
    [width - 3, height - 3],
    [width - 2, height - 3],
    [width - 2, height - 2],
  ])

  return grid
}

/**
 * Advance one generation into `next` and return it. Edges wrap (torus) so
 * growth never hits a dead wall. Callers swap the two buffers to avoid
 * allocating per frame.
 */
export function step(
  grid: Uint8Array,
  next: Uint8Array,
  width: number,
  height: number,
  table: Uint8Array,
): Uint8Array {
  for (let y = 0; y < height; y++) {
    const up = ((y - 1 + height) % height) * width
    const mid = y * width
    const down = ((y + 1) % height) * width
    for (let x = 0; x < width; x++) {
      const left = (x - 1 + width) % width
      const right = (x + 1) % width
      const neighbours =
        grid[up + left] + grid[up + x] + grid[up + right] +
        grid[mid + left] + grid[mid + right] +
        grid[down + left] + grid[down + x] + grid[down + right]
      const rule = table[neighbours]
      next[mid + x] = grid[mid + x] ? rule & 1 : (rule >> 1) & 1
    }
  }
  return next
}

/** Live cell count — the reseed trigger when a rule runs dry. */
export function population(grid: Uint8Array): number {
  let total = 0
  for (let i = 0; i < grid.length; i++) total += grid[i]
  return total
}
