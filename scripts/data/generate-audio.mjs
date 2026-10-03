import { ensureDeckAudio } from './audio.mjs'
import { ensureRemoteAudio } from './remote-audio.mjs'

/**
 * CLI: fill missing audio (npm run data:audio).
 * Phase 1 — deck JSON clips, Phase 2 — Firestore cards added via admin.
 * Ship new mp3s with `firebase deploy --only hosting`.
 */
try {
  const deck = await ensureDeckAudio()
  const remote = await ensureRemoteAudio()
  if (deck.failed || remote.failed) process.exitCode = 1
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
