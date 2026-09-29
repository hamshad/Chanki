import { describe, it, expect } from 'vitest'
import { FsrsScheduler } from './fsrs'

describe('FsrsScheduler', () => {
  const scheduler = new FsrsScheduler()

  it('generates preview for a new card', () => {
    const preview = scheduler.preview('card-1', null)
    expect(preview.again).toBeDefined()
    expect(preview.hard).toBeDefined()
    expect(preview.good).toBeDefined()
    expect(preview.easy).toBeDefined()

    expect(preview.good.label).toBeDefined()
    expect(preview.good.scheduledDays).toBeDefined()
  })

  it('applies rating for a new card', () => {
    const result = scheduler.apply('card-1', 'device-1', null, 'good')
    expect(result.progress.cardId).toBe('card-1')
    expect(result.progress.deviceId).toBe('device-1')
    expect(result.progress.reps).toBe(1)
    expect(result.reviewLog.rating).toBe('good')
    expect(result.reviewLog.cardId).toBe('card-1')
  })
})
