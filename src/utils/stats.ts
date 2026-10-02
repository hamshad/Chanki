/**
 * Deck overview math — Anki's "Deck overview" and "Forecast" numbers as
 * pure functions over cards + progress + review logs.
 *
 * Reference: Anki deck overview shows card-state counts (new/learning/
 * young/mature), today's studied totals, and a forecast of upcoming reviews;
 * the activity history comes from the revlog.
 */

import type { Card } from '../data/schema'
import type { Progress, ReviewLog } from '../types'
import { addDaysStamp, dayStampOf, localDayStamp, startOfLocalDay } from './day'

/** Anki's mature-card threshold: interval ≥ 21 days. */
const MATURE_DAYS = 21

export interface StatsOptions {
  now: number
  /** New-cards/day deck option (for "new left today"). */
  newPerDay: number
  /** Fresh cards already introduced today (meta counter). */
  introducedToday: number
}

export interface DeckOverview {
  /** Snapshot time the overview was computed at (for relative due labels). */
  now: number
  total: number
  /** Never reviewed. */
  newCount: number
  /** FSRS state Learning/Relearning (due whenever). */
  learningCount: number
  /** Reviewed, interval < 21 days. */
  youngCount: number
  /** Reviewed, interval ≥ 21 days. */
  matureCount: number
  dueNow: { total: number; learning: number; review: number }
  newToday: { introduced: number; left: number }
  today: { reviews: number; unique: number; againPct: number }
  /** Consecutive local days with ≥1 review, counting back from today. */
  streak: number
  /** Reviews due per local day for today…+13 (overdue folds into today). */
  forecast: { day: string; due: number }[]
  /** Reviews completed per local day for the past 13 days + today. */
  activity: { day: string; reviews: number; again: number }[]
  /** Soonest upcoming dues (due > now), soonest first. */
  upcoming: { card: Card; due: number }[]
}

function latestProgressByCard(progress: Progress[]): Map<string, Progress> {
  const map = new Map<string, Progress>()
  for (const p of progress) {
    const seen = map.get(p.cardId)
    if (!seen || p.updatedAt > seen.updatedAt) map.set(p.cardId, p)
  }
  return map
}

/** `count` consecutive local-day stamps starting at `startStamp`. */
function dayRange(startStamp: string, count: number): string[] {
  const days: string[] = []
  for (let i = 0; i < count; i++) days.push(addDaysStamp(startStamp, i))
  return days
}

/** Days with ≥1 review log, walking back from today (or yesterday). */
export function currentStreak(logs: ReviewLog[], now: number): number {
  const active = new Set(logs.map(log => dayStampOf(log.timestamp)))
  const today = localDayStamp(new Date(now))
  let start = today
  if (!active.has(today)) {
    start = addDaysStamp(today, -1)
    if (!active.has(start)) return 0
  }
  let streak = 0
  let cursor = start
  while (active.has(cursor)) {
    streak++
    cursor = addDaysStamp(cursor, -1)
  }
  return streak
}

export function buildDeckOverview(
  cards: Card[],
  progress: Progress[],
  logs: ReviewLog[],
  opts: StatsOptions,
): DeckOverview {
  const { now, newPerDay, introducedToday } = opts
  const byCard = latestProgressByCard(progress)
  const dueNowMs = now

  let newCount = 0
  let learningCount = 0
  let youngCount = 0
  let matureCount = 0
  let dueLearning = 0
  let dueReview = 0

  for (const card of cards) {
    const p = byCard.get(card.id)
    if (!p) {
      newCount++
      continue
    }
    const learning = p.state === 1 || p.state === 3
    if (learning) {
      learningCount++
      if (p.due <= dueNowMs) dueLearning++
    } else {
      const intervalDays = (p.due - p.updatedAt) / 86_400_000
      if (intervalDays >= MATURE_DAYS) matureCount++
      else youngCount++
      if (p.due <= dueNowMs) dueReview++
    }
  }

  const todayStart = startOfLocalDay(new Date(now))
  const todayLogs = logs.filter(log => log.timestamp >= todayStart)
  const todayAgain = todayLogs.filter(log => log.rating === 'again').length

  // Forecast: overdue cards count as due today (Anki folds them forward);
  // beyond the 14-day window is dropped.
  const todayStamp = localDayStamp(new Date(now))
  const forecastStamps = dayRange(todayStamp, 14)
  const forecastMap = new Map<string, number>(forecastStamps.map(day => [day, 0]))
  for (const card of cards) {
    const p = byCard.get(card.id)
    if (!p || p.state === 1 || p.state === 3) continue
    const stamp = dayStampOf(p.due)
    if (stamp < todayStamp) forecastMap.set(todayStamp, (forecastMap.get(todayStamp) ?? 0) + 1)
    else if (forecastMap.has(stamp)) forecastMap.set(stamp, (forecastMap.get(stamp) ?? 0) + 1)
  }

  // Activity: review-log counts per day, past 13 days + today.
  const activityStamps = dayRange(addDaysStamp(todayStamp, -13), 14)
  const activityMap = new Map<string, { reviews: number; again: number }>(
    activityStamps.map(day => [day, { reviews: 0, again: 0 }]),
  )
  for (const log of logs) {
    const stamp = dayStampOf(log.timestamp)
    const bucket = activityMap.get(stamp)
    if (!bucket) continue
    bucket.reviews++
    if (log.rating === 'again') bucket.again++
  }

  // Upcoming: soonest future dues among reviewed cards (learning included).
  const upcoming = cards
    .flatMap(card => {
      const p = byCard.get(card.id)
      return p && p.due > now ? [{ card, due: p.due }] : []
    })
    .sort((a, b) => a.due - b.due)
    .slice(0, 12)

  return {
    now,
    total: cards.length,
    newCount,
    learningCount,
    youngCount,
    matureCount,
    dueNow: {
      total: dueLearning + dueReview,
      learning: dueLearning,
      review: dueReview,
    },
    newToday: {
      introduced: introducedToday,
      left: Math.max(0, newPerDay - introducedToday),
    },
    today: {
      reviews: todayLogs.length,
      unique: new Set(todayLogs.map(log => log.cardId)).size,
      againPct: todayLogs.length ? Math.round((todayAgain / todayLogs.length) * 100) : 0,
    },
    streak: currentStreak(logs, now),
    forecast: forecastStamps.map(day => ({ day, due: forecastMap.get(day) ?? 0 })),
    activity: activityStamps.map(day => ({ day, ...activityMap.get(day)! })),
    upcoming,
  }
}

/** Anki-flavoured relative due label: "in 3h", "tomorrow", "in 5d", or a date. */
export function formatDue(dueMs: number, now: number): string {
  const diff = dueMs - now
  const dayMs = 86_400_000
  if (diff <= 0) return 'due now'
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(diff / 3_600_000)
  if (hours < 24 && dayStampOf(dueMs) === dayStampOf(now)) return `in ${hours}h`
  const days = Math.round(diff / dayMs)
  if (days <= 1) return 'tomorrow'
  if (days < 30) return `in ${days}d`
  return dayStampOf(dueMs)
}
