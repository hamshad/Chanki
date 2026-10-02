/**
 * Daily queue builder — Anki-style assembly of the session queue.
 *
 * Reference: Anki's scheduler queue construction
 * (github.com/ankitects/anki — rslib/src/sched/queue_builder):
 *   • classify every card: new / learning (incl. relearning) / review
 *   • due cards surface first (oldest due first), learning before reviews
 *   • fresh cards are ordered (here: shuffled — Anki "gather order: Random")
 *     and then cut at the new-cards/day limit
 *   • a reviews/day cap bounds the review queue (Anki default 200)
 *
 * Pure module: no I/O, no randomness except the injectable rng.
 */

import type { Card } from '../data/schema'
import type { Progress } from '../types'
import { endOfLocalDay } from '../utils/day'

/** Anki's default new-cards/day limit. */
export const NEW_PER_DAY = 20
/** Anki's default reviews/day limit. */
export const REVIEWS_PER_DAY = 200

export type CardKind = 'new' | 'learning' | 'review'

export interface QueueOptions {
  /** Epoch ms — everything is computed relative to this. */
  now: number
  /** New cards allowed to be introduced today (Anki deck option). */
  newPerDay?: number
  /** Review cap for the session (Anki deck option). */
  reviewsPerDay?: number
  /** How many fresh cards were already introduced today (meta counter). */
  introducedToday?: number
  /** 'random' shuffles fresh cards (Anki "gather order: Random"), 'added' keeps deck order. */
  newOrder?: 'random' | 'added'
  /** Injectable RNG so tests can pin the shuffle. */
  rng?: () => number
}

export interface QueueItem {
  card: Card
  kind: CardKind
}

export interface QueueCounts {
  new: number
  learning: number
  review: number
}

export interface DailyQueue {
  queue: QueueItem[]
  counts: QueueCounts
}

/**
 * FSRS card state → our queue kind.
 * state: 0 New · 1 Learning · 2 Review · 3 Relearning (ts-fsrs/Anki values).
 * Rows without state predate the state field — they have been reviewed, so
 * they are reviews.
 */
export function classify(progress: Progress | undefined): CardKind {
  if (!progress) return 'new'
  if (progress.state === 1 || progress.state === 3) return 'learning'
  return 'review'
}

/** Fisher–Yates using the given rng (defaults to Math.random). */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function latestProgressByCard(progress: Progress[]): Map<string, Progress> {
  const map = new Map<string, Progress>()
  for (const p of progress) {
    const seen = map.get(p.cardId)
    if (!seen || p.updatedAt > seen.updatedAt) map.set(p.cardId, p)
  }
  return map
}

export function countByKind(queue: QueueItem[]): QueueCounts {
  const counts: QueueCounts = { new: 0, learning: 0, review: 0 }
  for (const item of queue) counts[item.kind]++
  return counts
}

/**
 * Build today's session queue.
 *
 * Order: due learning (overdue first) → due reviews (oldest first) → fresh
 * cards (shuffled by default, cut at the daily new limit). Sub-day requeues
 * during the session are appended by the caller (ReviewSession).
 */
export function buildDailyQueue(
  cards: Card[],
  progress: Progress[],
  opts: QueueOptions,
): DailyQueue {
  const {
    now,
    newPerDay = NEW_PER_DAY,
    reviewsPerDay = REVIEWS_PER_DAY,
    introducedToday = 0,
    newOrder = 'random',
    rng = Math.random,
  } = opts

  const dueBefore = endOfLocalDay(new Date(now))
  const byCard = latestProgressByCard(progress)

  const dueLearning: QueueItem[] = []
  const dueReview: QueueItem[] = []
  const fresh: QueueItem[] = []

  for (const card of cards) {
    const p = byCard.get(card.id)
    const kind = classify(p)
    if (kind === 'new') {
      fresh.push({ card, kind })
    } else if (p!.due <= dueBefore) {
      if (kind === 'learning') dueLearning.push({ card, kind })
      else dueReview.push({ card, kind })
    }
  }

  // Oldest due first — Anki surfaces the most overdue learning/reviews first.
  dueLearning.sort((a, b) => byCard.get(a.card.id)!.due - byCard.get(b.card.id)!.due)
  dueReview.sort((a, b) => byCard.get(a.card.id)!.due - byCard.get(b.card.id)!.due)

  // Daily limits: reviews first-come by overdue order, then new cards after
  // ordering (Anki applies the limit to the ordered stream).
  const reviewQueue = dueReview.slice(0, reviewsPerDay)
  const orderedFresh = (newOrder === 'random' ? shuffle(fresh, rng) : fresh).slice(
    0,
    Math.max(0, newPerDay - introducedToday),
  )

  const queue = [...dueLearning, ...reviewQueue, ...orderedFresh]
  return { queue, counts: countByKind(queue) }
}
