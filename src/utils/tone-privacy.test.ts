import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const TONE_CAPTURE_SOURCES = [
  resolve(process.cwd(), 'src/utils/scoring.ts'),
  resolve(process.cwd(), 'src/utils/toneContour.ts'),
  resolve(process.cwd(), 'src/components/ToneContour.tsx'),
  resolve(process.cwd(), 'src/hooks/useToneCapture.ts'),
  resolve(process.cwd(), 'src/pages/ToneTrainer.tsx'),
]

const NETWORK_APIS = [
  'fetch(',
  'XMLHttpRequest',
  'sendBeacon',
  'WebSocket',
  'EventSource',
  'navigator.connection',
]

describe('TONE-03: mic capture never leaves the device', () => {
  it.each(TONE_CAPTURE_SOURCES)('%s performs no network I/O', sourcePath => {
    const source = readFileSync(sourcePath, 'utf8')

    for (const api of NETWORK_APIS) {
      expect(source, `${sourcePath} must not use ${api}`).not.toContain(api)
    }
  })

  it('scoring math is pure — input pitches, output number', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/utils/scoring.ts'), 'utf8')

    expect(source).not.toContain('import.meta.env')
    expect(source).not.toContain('localStorage')
    expect(source).not.toContain('indexedDB')
  })
})
