/**
 * FsrsScheduler — ts-fsrs v5.4.2 implementation of IScheduler.
 *
 * Maps between our app types (Rating strings, Progress rows) and the ts-fsrs
 * Card/Rating types. All ts-fsrs imports are confined to THIS file.
 */

import {
  fsrs,
  createEmptyCard,
  Rating as FsrsRating,
  type Card as FsrsCard,
  type FSRSParameters,
} from 'ts-fsrs'
import type { Progress, Rating } from '../types'
import type { IScheduler, RatingPreview, SchedulerPreview, SchedulerResult } from './index'

// ─── Rating mapping ───────────────────────────────────────────────────────────

const APP_TO_FSRS: Record<Rating, FsrsRating> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
}

const ALL_RATINGS: Rating[] = ['again', 'hard', 'good', 'easy']

// ─── Progress ↔ FsrsCard conversion ─────────────────────────────────────────

/**
 * Convert a Progress row from Dexie to the ts-fsrs Card shape.
 * Returns null (createEmptyCard) when progress doesn't exist yet (first review).
 */
function toFsrsCard(existing: Progress | null): FsrsCard {
  if (!existing) {
    return createEmptyCard()
  }

  // ts-fsrs Card fields we need to restore from our Progress record
  return {
    due: new Date(existing.due),
    stability: existing.stability,
    difficulty: existing.difficulty,
    elapsed_days: 0,          // recalculated by ts-fsrs from due vs now
    scheduled_days: 0,        // recalculated
    reps: existing.reps,
    lapses: existing.lapses,
    learning_steps: (existing as unknown as { learning_steps?: number }).learning_steps ?? 0,
    state: (existing as unknown as { state?: number }).state ?? 0,
    last_review: existing.updatedAt ? new Date(existing.updatedAt) : undefined,
  } as unknown as FsrsCard
}

/**
 * Build the Progress fields from a ts-fsrs Card result + metadata.
 */
function fromFsrsCard(
  fsrsCard: FsrsCard,
  cardId: string,
  deviceId: string,
): Omit<Progress, 'id'> {
  return {
    cardId,
    deviceId,
    stability: fsrsCard.stability,
    difficulty: fsrsCard.difficulty,
    due: fsrsCard.due.getTime(),
    reps: fsrsCard.reps,
    lapses: fsrsCard.lapses,
    syncStatus: 'pending',
    updatedAt: Date.now(),
    // Store ts-fsrs internal fields as extras (needed to reconstruct card on next review)
    ...(({ state: fsrsCard.state, learning_steps: fsrsCard.learning_steps } as Record<string, unknown>)),
  } as unknown as Omit<Progress, 'id'>
}

// ─── Label formatting ─────────────────────────────────────────────────────────

function formatIntervalLabel(dueDate: Date, now: Date): string {
  const diffMs = dueDate.getTime() - now.getTime()
  const diffMins = Math.round(diffMs / 60_000)
  const diffDays = Math.round(diffMs / 86_400_000)

  if (diffMins < 1) return '<1 min'
  if (diffMins < 60) return `${diffMins} min`
  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays === 1) return '1 day'
  return `${diffDays} days`
}

// ─── FsrsScheduler ───────────────────────────────────────────────────────────

const DEFAULT_PARAMS: Partial<FSRSParameters> = {
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
}

export class FsrsScheduler implements IScheduler {
  private readonly algo = fsrs(DEFAULT_PARAMS)

  preview(cardId: string, existing: Progress | null): SchedulerPreview {
    void cardId // cardId not needed for pure computation, but part of interface
    const fsrsCard = toFsrsCard(existing)
    const now = new Date()
    const outcomes = this.algo.repeat(fsrsCard, now)

    const result = {} as SchedulerPreview
    for (const rating of ALL_RATINGS) {
      const fsrsRating = APP_TO_FSRS[rating]
      const outcome = (outcomes as any)[fsrsRating]
      const dueDate = outcome.card.due

      result[rating] = {
        dueMs: dueDate.getTime(),
        label: formatIntervalLabel(dueDate, now),
        scheduledDays: outcome.card.scheduled_days,
      } satisfies RatingPreview
    }

    return result
  }

  apply(
    cardId: string,
    deviceId: string,
    existing: Progress | null,
    rating: Rating,
  ): SchedulerResult {
    const fsrsCard = toFsrsCard(existing)
    const now = new Date()
    const fsrsRating = APP_TO_FSRS[rating]

    const { card: updatedCard, log } = this.algo.next(fsrsCard, now, fsrsRating as any)

    const progress = fromFsrsCard(updatedCard, cardId, deviceId)

    const reviewLog: Omit<ReviewLog, 'id'> = {
      cardId,
      deviceId,
      rating,
      scheduledDays: log.scheduled_days,
      elapsedDays: log.elapsed_days ?? log.last_elapsed_days ?? 0,
      timestamp: now.getTime(),
    }

    return { progress, reviewLog }
  }
}

// Re-export for typing convenience
import type { ReviewLog } from '../types'
