import { describe, it, expect, beforeEach } from 'vitest'
import { saveReview, getProgress, getReviewHistory } from './review'
import { db } from './db'

describe('review db operations', () => {
  beforeEach(async () => {
    await db.progress.clear()
    await db.reviewLogs.clear()
  })

  it('saves new review and retrieves it', async () => {
    const progress = {
      cardId: 'card-1',
      deviceId: 'device-1',
      stability: 1,
      difficulty: 1,
      due: Date.now(),
      reps: 1,
      lapses: 0,
      syncStatus: 'pending' as const,
      updatedAt: Date.now(),
    }
    const reviewLog = {
      cardId: 'card-1',
      deviceId: 'device-1',
      rating: 'good' as const,
      scheduledDays: 1,
      elapsedDays: 0,
      timestamp: Date.now(),
    }
    const { progressId, reviewLogId } = await saveReview(progress, reviewLog)
    expect(progressId).toBeDefined()
    expect(reviewLogId).toBeDefined()

    const savedProgress = await getProgress('card-1', 'device-1')
    expect(savedProgress).toBeDefined()
    expect(savedProgress?.stability).toBe(1)

    const logs = await getReviewHistory('card-1', 'device-1')
    expect(logs.length).toBe(1)
    expect(logs[0].rating).toBe('good')
  })
})
