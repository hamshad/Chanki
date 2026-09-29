/**
 * Scheduler interface — the single abstraction layer between the app and
 * whatever SRS algorithm is running underneath (currently ts-fsrs).
 *
 * RULE: No other file imports ts-fsrs directly. All algorithm calls go
 *       through this interface so swapping algorithms never ripples out.
 */

import type { Progress, ReviewLog, Rating } from '../types'

// ─── Preview ──────────────────────────────────────────────────────────────────

/**
 * One entry in the preview map — what happens if the user picks this rating.
 */
export interface RatingPreview {
  /** When the card will next be due (Unix ms timestamp). */
  dueMs: number
  /** Human-friendly label e.g. "<1 min", "10 min", "4 days" */
  label: string
  /** Scheduled interval in days (0 for sub-day steps). */
  scheduledDays: number
}

/** Map of all 4 ratings → what would happen if chosen. */
export type SchedulerPreview = Record<Rating, RatingPreview>

// ─── Apply result ─────────────────────────────────────────────────────────────

/**
 * What the scheduler returns after a rating is applied.
 * Both records are ready to write to Dexie — call saveReview(result) to persist.
 */
export interface SchedulerResult {
  progress: Omit<Progress, 'id'>   // upsert by [cardId+deviceId]
  reviewLog: Omit<ReviewLog, 'id'> // append-only
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IScheduler {
  /**
   * Returns next-due previews for all 4 ratings WITHOUT applying them.
   * Call this to populate the grading button labels before the user picks.
   *
   * @param cardId     UUID of the card being reviewed
   * @param existing   Current Progress from Dexie, or null for a brand-new card
   */
  preview(cardId: string, existing: Progress | null): SchedulerPreview

  /**
   * Applies a rating and returns the updated Progress + a new ReviewLog entry.
   * Does NOT write to the database — caller persists via saveReview().
   *
   * @param cardId    UUID of the card being reviewed
   * @param deviceId  Anonymous device UUID from getOrCreateDeviceId()
   * @param existing  Current Progress from Dexie, or null for first review
   * @param rating    User's chosen rating
   */
  apply(
    cardId: string,
    deviceId: string,
    existing: Progress | null,
    rating: Rating,
  ): SchedulerResult
}

// ─── Default export ───────────────────────────────────────────────────────────

export { FsrsScheduler } from './fsrs'

/** Singleton scheduler instance shared across the app. */
import { FsrsScheduler } from './fsrs'
export const scheduler: IScheduler = new FsrsScheduler()
