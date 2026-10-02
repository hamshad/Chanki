import { describe, it, expect } from 'vitest'
import { buildDeckOverview, currentStreak, formatDue } from './stats'
import { addDaysStamp, localDayStamp, startOfLocalDay } from './day'
import type { Card } from '../data/schema'
import type { Progress, ReviewLog } from '../types'

const DECK_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const NOW = new Date(2026, 9, 2, 12, 0, 0).getTime() // local noon, Oct 2 2026
const TODAY = localDayStamp(new Date(NOW))

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
    id: `00000000-0000-4000-8000-1${String(++seq).padStart(11, '0')}`,
    cardId,
    deviceId: '00000000-0000-4000-8000-200000000001',
    stability: 3,
    difficulty: 5,
    due: NOW,
    reps: 2,
    lapses: 0,
    state: 2,
    syncStatus: 'pending',
    updatedAt: NOW,
    ...over,
  }
}

function log(cardId: string, over: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: `00000000-0000-4000-8000-2${String(++seq).padStart(11, '0')}`,
    cardId,
    deviceId: '00000000-0000-4000-8000-200000000001',
    rating: 'good',
    scheduledDays: 1,
    elapsedDays: 0,
    timestamp: NOW,
    ...over,
  }
}

describe('currentStreak', () => {
  it('counts consecutive active days back from today', () => {
    const logs = [0, 1, 2].map(d => log('c', { timestamp: NOW - d * 86_400_000 }))
    expect(currentStreak(logs, NOW)).toBe(3)
  })

  it('still counts a streak when today has no reviews yet but yesterday did', () => {
    const logs = [1, 2].map(d => log('c', { timestamp: NOW - d * 86_400_000 }))
    expect(currentStreak(logs, NOW)).toBe(2)
  })

  it('breaks on gaps and empty history', () => {
    const gapped = [log('c', { timestamp: NOW - 86_400_000 }), log('c', { timestamp: NOW - 3 * 86_400_000 })]
    expect(currentStreak(gapped, NOW)).toBe(1)
    expect(currentStreak([], NOW)).toBe(0)
  })
})

describe('buildDeckOverview', () => {
  it('splits card states and due counts', () => {
    const unseen = card('U')
    const learning = card('L')
    const young = card('Y')
    const mature = card('M')
    const future = card('F')

    const overview = buildDeckOverview(
      [unseen, learning, young, mature, future],
      [
        progress(learning.id, { state: 1, due: NOW - 3_600_000 }),
        progress(young.id, { state: 2, due: NOW - 86_400_000, updatedAt: NOW - 5 * 86_400_000 }),
        progress(mature.id, { state: 2, due: NOW - 86_400_000, updatedAt: NOW - 30 * 86_400_000 }),
        progress(future.id, { state: 2, due: NOW + 4 * 86_400_000, updatedAt: NOW }),
      ],
      [],
      { now: NOW, newPerDay: 20, introducedToday: 0 },
    )

    expect(overview.total).toBe(5)
    expect(overview.newCount).toBe(1)
    expect(overview.learningCount).toBe(1)
    expect(overview.youngCount).toBe(2) // young + future-due young
    expect(overview.matureCount).toBe(1)
    expect(overview.dueNow).toEqual({ total: 3, learning: 1, review: 2 })
    expect(overview.newToday).toEqual({ introduced: 0, left: 20 })
  })

  it('buckets forecast: overdue folds into today, future sits on its day', () => {
    const overdue = card('O')
    const in3 = card('T')
    const in20 = card('X')

    const overview = buildDeckOverview(
      [overdue, in3, in20],
      [
        progress(overdue.id, { due: NOW - 3 * 86_400_000 }),
        progress(in3.id, { due: NOW + 3 * 86_400_000 }),
        progress(in20.id, { due: NOW + 20 * 86_400_000 }), // beyond 14d window
      ],
      [],
      { now: NOW, newPerDay: 20, introducedToday: 0 },
    )

    expect(overview.forecast).toHaveLength(14)
    expect(overview.forecast[0]).toEqual({ day: TODAY, due: 1 })
    expect(overview.forecast[3]).toEqual({ day: addDaysStamp(TODAY, 3), due: 1 })
    expect(overview.forecast.reduce((sum, f) => sum + f.due, 0)).toBe(2)
  })

  it('aggregates activity and today counters from review logs', () => {
    const logs = [
      log('a', { rating: 'good' }),
      log('a', { rating: 'again' }),
      log('b', { rating: 'easy' }),
      log('b', { rating: 'good', timestamp: NOW - 86_400_000 }), // yesterday
    ]
    const overview = buildDeckOverview([], [], logs, {
      now: NOW,
      newPerDay: 20,
      introducedToday: 4,
    })

    expect(overview.today).toEqual({ reviews: 3, unique: 2, againPct: 33 })
    expect(overview.activity).toHaveLength(14)
    const todayBucket = overview.activity[overview.activity.length - 1]
    expect(todayBucket).toEqual({ day: TODAY, reviews: 3, again: 1 })
    const yesterdayBucket = overview.activity[overview.activity.length - 2]
    expect(yesterdayBucket.reviews).toBe(1)
    expect(overview.newToday).toEqual({ introduced: 4, left: 16 })
    expect(overview.streak).toBe(2)
  })

  it('lists upcoming dues soonest first', () => {
    const later = card('L')
    const sooner = card('S')
    const overview = buildDeckOverview(
      [later, sooner],
      [
        progress(later.id, { due: NOW + 9 * 86_400_000 }),
        progress(sooner.id, { due: NOW + 3_600_000 }),
      ],
      [],
      { now: NOW, newPerDay: 20, introducedToday: 0 },
    )
    expect(overview.upcoming.map(u => u.card.hanzi)).toEqual(['S', 'L'])
  })
})

describe('formatDue', () => {
  it('formats relative due times like Anki', () => {
    expect(formatDue(NOW - 1000, NOW)).toBe('due now')
    expect(formatDue(NOW + 30 * 60_000, NOW)).toBe('in 30m')
    expect(formatDue(NOW + 3 * 3_600_000, NOW)).toBe('in 3h')
    expect(formatDue(startOfLocalDay(new Date(NOW)) + 86_400_000 + 9 * 3_600_000, NOW)).toBe(
      'tomorrow',
    )
    expect(formatDue(NOW + 5 * 86_400_000, NOW)).toBe('in 5d')
    expect(formatDue(NOW + 45 * 86_400_000, NOW)).toBe(addDaysStamp(TODAY, 45))
  })
})
