import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'

let testEnv: RulesTestEnvironment

describe('Firestore Rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'chanki-test',
      firestore: {
        rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'),
      },
    })
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
  })

  it('denies read/write to decks collection', async () => {
    const unauthed = testEnv.unauthenticatedContext()
    const db = unauthed.firestore()

    await assertFails(db.collection('decks').get())
    await assertFails(db.collection('decks').add({ name: 'test' }))
  })

  it('denies read/write to cards collection', async () => {
    const unauthed = testEnv.unauthenticatedContext()
    const db = unauthed.firestore()

    await assertFails(db.collection('cards').get())
    await assertFails(db.collection('cards').add({ hanzi: 'test' }))
  })

  it('allows read/write to any devices/{deviceId}', async () => {
    const unauthed = testEnv.unauthenticatedContext()
    const db = unauthed.firestore()
    const deviceRef = db.collection('devices').doc('device-uuid-123')

    await assertSucceeds(deviceRef.set({ updatedAt: 123 }))
    await assertSucceeds(deviceRef.get())
  })

  it('allows read/write to devices/{deviceId}/progress/{progressId}', async () => {
    const unauthed = testEnv.unauthenticatedContext()
    const db = unauthed.firestore()
    const progressRef = db
      .collection('devices')
      .doc('device-uuid-123')
      .collection('progress')
      .doc('progress-uuid-123')

    await assertSucceeds(progressRef.set({ stability: 1.0 }))
    await assertSucceeds(progressRef.get())
  })
})
