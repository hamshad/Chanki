import { describe, it, expect } from 'vitest'
import { buildDailyQueue, classify, countByKind, NEW_PER_DAY, REVIEWS_PER_DAY } from './queue'
import type { Card } from '../data/schema'
import type { Progress } from '../types'

const DECK_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const NOW = new Date(2026, 9, 2, 12, 0, 0).getTime() // local noon, Oct 2 2026

let seq = 0
function card(hanzi: string): Card {
  seq++
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    deckId: DECK_ID,
    hanzi,
    pinyin: 'pin',
    meaning: 'mean',
    tone: '1',
    tags: [],
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function progress(cardId: string, over: Partial<Progress> = {}): Progress {
  return {
    id: `00000000-0000-4000-8000-1${String(seq).padStart(11, '0')}`,
    cardId,
    deviceId: '00000000-0000-4000-8000-200000000001',
    stability: 3,
    difficulty: 5,
    due: NOW - 86_400_000,
    reps: 2,
    lapses: 0,
    state: 2,
    syncStatus: 'pending',
    updatedAt: NOW - 86_400_000,
    ...over,
  }
}

describe('classify', () => {
  it('maps progress-less cards to new, FSRS states to learning/review', () => {
    expect(classify(undefined)).toBe('new')
    expect(classify(progress('x', { state: 1 }))).toBe('learning')
    expect(classify(progress('x', { state: 3 }))).toBe('learning')
    expect(classify(progress('x', { state: 2 }))).toBe('review')
    expect(classify(progress('x', { state: undefined }))).toBe('review')
  })
})

describe('buildDailyQueue', () => {
  it('orders queue: learning → reviews (oldest due first) → new', () => {
    const a = card('A') // due yesterday (review)
    const b = card('B') // due a week ago (review)
    const l = card('L') // overdue learning
    const n1 = card('N1')
    const n2 = card('N2')

    const { queue } = buildDailyQueue(
      [a, b, l, n1, n2],
      [
        progress(a.id, { due: NOW - 86_400_000 }),
        progress(b.id, { due: NOW - 7 * 86_400_000 }),
        progress(l.id, { due: NOW - 86_400_000, state: 1 }),
      ],
      { now: NOW, newOrder: 'added', rng: () => 0.5 },
    )

    expect(queue.map(i => i.card.hanzi)).toEqual(['L', 'B', 'A', 'N1', 'N2'])
    expect(queue.map(i => i.kind)).toEqual(['learning', 'review', 'review', 'new', 'new'])
  })

  it('excludes cards not due until tomorrow', () => {
    const future = card('F')
    const fresh = card('N')
    const { queue } = buildDailyQueue(
      [future, fresh],
      [progress(future.id, { due: NOW + 86_400_000 })],
      { now: NOW },
    )
    expect(queue.map(i => i.card.hanzi)).toEqual(['N'])
  })

  it('shuffles fresh cards with rng and keeps them a permutation of deck order', () => {
    const fresh = [card('A'), card('B'), card('C'), card('D')]
    const { queue } = buildDailyQueue(fresh, [], {
      now: NOW,
      rng: () => 0, // Fisher–Yates with rng=0 → deterministic rotation
    })
    const got = queue.map(i => i.card.hanzi)
    expect(got).toHaveLength(4)
    expect([...got].sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(got).not.toEqual(['A', 'B', 'C', 'D'])
  })

  it('newOrder "added" keeps deck order', () => {
    const fresh = [card('A'), card('B'), card('C')]
    const { queue } = buildDailyQueue(fresh, [], { now: NOW, newOrder: 'added' })
    expect(queue.map(i => i.card.hanzi)).toEqual(['A', 'B', 'C'])
  })

  it('applies the new/day limit minus cards already introduced today', () => {
    const fresh = Array.from({ length: 30 }, (_, i) => card(`C${i}`))
    const full = buildDailyQueue(fresh, [], { now: NOW, newPerDay: 20, introducedToday: 0 })
    expect(full.counts.new).toBe(20)

    const used = buildDailyQueue(fresh, [], { now: NOW, newPerDay: 20, introducedToday: 17 })
    expect(used.counts.new).toBe(3)

    const exhausted = buildDailyQueue(fresh, [], { now: NOW, newPerDay: 20, introducedToday: 25 })
    expect(exhausted.counts.new).toBe(0)
  })

  it('caps the review queue at reviewsPerDay, keeping most overdue', () => {
    const many = Array.from({ length: 10 }, (_, i) => card(`R${i}`))
    const rows = many.map((c, i) => progress(c.id, { due: NOW - (i + 1) * 3_600_000 }))
    const { queue, counts } = buildDailyQueue(many, rows, {
      now: NOW,
      reviewsPerDay: 4,
    })
    expect(counts.review).toBe(4)
    // Oldest due first: R9 (10h ago) leads.
    expect(queue[0].card.hanzi).toBe('R9')
  })

  it('defaults: 20 new/day, 200 reviews/day', () => {
    expect(NEW_PER_DAY).toBe(20)
    expect(REVIEWS_PER_DAY).toBe(200)
  })

  it('countByKind tallies the queue', () => {
    const counts = countByKind([
      { card: card('1'), kind: 'new' },
      { card: card('2'), kind: 'learning' },
      { card: card('3'), kind: 'review' },
      { card: card('4'), kind: 'review' },
    ])
    expect(counts).toEqual({ new: 1, learning: 1, review: 2 })
  })
})
