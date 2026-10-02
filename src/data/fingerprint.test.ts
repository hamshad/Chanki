import { describe, it, expect } from 'vitest'
import {
  collectSignals,
  computeFingerprint,
  fingerprintInput,
  fnv1aHex,
  type DeviceSignals,
} from './fingerprint'

const SIGNALS: DeviceSignals = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  platform: 'MacIntel',
  language: 'en-US',
  timeZone: 'Asia/Kolkata',
  screenWidth: 1728,
  screenHeight: 1117,
  colorDepth: 30,
  pixelRatio: 2,
  hardwareConcurrency: 10,
  maxTouchPoints: 0,
  deviceMemory: 16,
  webglRenderer: 'Apple M2 Pro',
}

describe('fingerprint', () => {
  it('serializes stable signals in a field-ordered input', () => {
    expect(fingerprintInput(SIGNALS)).toBe(
      'MacIntel|en-US|Asia/Kolkata|1728|1117|30|2|10|0|16|Apple M2 Pro',
    )
    expect(fingerprintInput({ ...SIGNALS })).toBe(fingerprintInput(SIGNALS))
  })

  it('excludes userAgent (browser updates churn it; identity must not)', () => {
    const base = fingerprintInput(SIGNALS)
    expect(fingerprintInput({ ...SIGNALS, userAgent: 'Mozilla/5.0 Chrome/999.0' })).toBe(base)
  })

  it('changes when any identity signal changes', () => {
    const base = fingerprintInput(SIGNALS)
    expect(fingerprintInput({ ...SIGNALS, timeZone: 'UTC' })).not.toBe(base)
    expect(fingerprintInput({ ...SIGNALS, screenWidth: 1920 })).not.toBe(base)
    expect(fingerprintInput({ ...SIGNALS, language: 'de-DE' })).not.toBe(base)
    expect(fingerprintInput({ ...SIGNALS, hardwareConcurrency: 8 })).not.toBe(base)
    expect(fingerprintInput({ ...SIGNALS, webglRenderer: 'AMD Radeon' })).not.toBe(base)
    expect(fingerprintInput({ ...SIGNALS, deviceMemory: null })).not.toBe(base)
  })

  it('fnv1aHex is deterministic 16-hex-char output', () => {
    const a = fnv1aHex('chanki|signals')
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(fnv1aHex('chanki|signals')).toBe(a)
    expect(fnv1aHex('chanki|signalz')).not.toBe(a)
  })

  it('computeFingerprint is deterministic and hex-encoded', async () => {
    const a = await computeFingerprint(SIGNALS)
    const b = await computeFingerprint(SIGNALS)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32,64}$/)
    const other = await computeFingerprint({ ...SIGNALS, timeZone: 'Europe/Berlin' })
    expect(other).not.toBe(a)
  })

  it('collectSignals never throws in the test environment', () => {
    const signals = collectSignals()
    expect(typeof signals.userAgent).toBe('string')
    expect(signals.timeZone.length).toBeGreaterThan(0)
    expect(signals.screenWidth).toBeGreaterThanOrEqual(0)
    expect(typeof signals.hardwareConcurrency).toBe('number')
    expect(typeof signals.webglRenderer).toBe('string')
  })
})
