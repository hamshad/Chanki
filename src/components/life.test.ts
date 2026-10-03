import { describe, it, expect } from 'vitest'
import {
  CONWAY,
  CORAL,
  DAY_AND_NIGHT,
  HIGHLIFE,
  MAZE,
  RULES,
  SEEDS,
  population,
  seedGrid,
  step,
  tableFor,
} from './life'

function board(rows: string[]): Uint8Array {
  const grid = new Uint8Array(rows.length * rows[0].length)
  rows.forEach((row, y) =>
    [...row].forEach((cell, x) => {
      grid[y * row.length + x] = cell === '#' ? 1 : 0
    }),
  )
  return grid
}

function render(grid: Uint8Array, width: number): string[] {
  return Array.from({ length: grid.length / width }, (_, y) =>
    [...grid.slice(y * width, y * width + width)]
      .map(c => (c ? '#' : '.'))
      .join(''),
  )
}

/** Runs one generation and returns the fresh board as text rows. */
function gen(rows: string[], table = tableFor(CONWAY.id)): string[] {
  const width = rows[0].length
  const grid = board(rows)
  return render(step(grid, new Uint8Array(grid.length), width, rows.length, table), width)
}

describe('life rules', () => {
  it('exposes B/S variants, not just Conway', () => {
    expect(RULES.map(r => r.id)).toEqual([
      'conway',
      'highlife',
      'maze',
      'daynight',
      'seeds',
      'coral',
    ])
    expect(HIGHLIFE.birth).toContain(6)
    expect(MAZE.survival).toEqual([1, 2, 3])
    expect(DAY_AND_NIGHT.birth).toEqual([3, 6, 7, 8])
    expect(SEEDS.survival).toEqual([])
    expect(CORAL.survival).toEqual([4, 5, 6, 7, 8])
  })

  it('encodes birth and survival into the neighbour lookup table', () => {
    const table = tableFor('conway')
    // 3 neighbours both births and survives a live cell → both bits set.
    expect(table[3]).toBe(0b11)
    expect(table[2]).toBe(0b01) // survives only
    expect(table[0]).toBe(0b00)
    // Unknown rule falls back to Conway rather than crashing.
    expect(tableFor('nope')).toEqual(table)
  })
})

describe('step', () => {
  it('implements Conway: a block is still, a blinker flips axis', () => {
    expect(
      gen([
        '....',
        '.##.',
        '.##.',
        '....',
      ]),
    ).toEqual([
      '....',
      '.##.',
      '.##.',
      '....',
    ])

    // Vertical blinker (rows 1-3, col 1) → horizontal across row 2.
    expect(
      gen([
        '...',
        '.#.',
        '.#.',
        '.#.',
        '...',
      ]),
    ).toEqual([
      '...',
      '...',
      '###',
      '...',
      '...',
    ])
  })

  it('wraps at the edges instead of dying against a wall', () => {
    // A vertical line straddling the top/bottom seam is only a line under
    // toroidal wrap; on a hard-clipped board all three cells would die.
    expect(
      gen([
        '.#.',
        '.#.',
        '...',
        '.#.',
      ]),
    ).toEqual([
      '###',
      '...',
      '...',
      '...',
    ])
  })

  it('runs HighLife differently — 6 neighbours is a birth there', () => {
    const seed = [
      '..#..',
      '.#.#.',
      '.#.#.',
      '.#.#.',
      '..#..',
    ]
    const populationCount = (rows: string[]) => rows.join('').split('').filter(c => c === '#').length
    expect(populationCount(gen(seed, tableFor('highlife')))).not.toBe(
      populationCount(gen(seed, tableFor(CONWAY.id))),
    )
  })

  it('counts live cells', () => {
    expect(population(board(['.#.', '..#']))).toBe(2)
    expect(population(new Uint8Array(9))).toBe(0)
  })
})

describe('seedGrid', () => {
  it('always produces a populated board so the loader never starts blank', () => {
    for (const rule of RULES) {
      const grid = seedGrid(32, 18, 1337)
      expect(population(grid)).toBeGreaterThan(20)
      expect(grid.length).toBe(32 * 18)
      expect(rule.birth.length).toBeGreaterThan(0)
    }
  })

  it('is deterministic for a given seed', () => {
    expect(Array.from(seedGrid(24, 12, 7))).toEqual(Array.from(seedGrid(24, 12, 7)))
  })

  it('stays alive under the sparsest rule', () => {
    // Seeds (B2/S) kills every survivor each generation; new births must
    // keep appearing or the surface would freeze mid-load.
    const table = tableFor('seeds')
    let grid = seedGrid(40, 22, 99)
    const buffer = new Uint8Array(grid.length)
    for (let i = 0; i < 40; i++) {
      const next = step(grid, buffer, 40, 22, table)
      buffer.set(grid)
      grid = next
      if (population(grid) < 3) {
        grid = seedGrid(40, 22, 99 + i)
        buffer.fill(0)
      }
    }
    expect(population(grid)).toBeGreaterThan(0)
  })
})
