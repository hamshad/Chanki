import { describe, it, expect } from 'vitest'
import {
  compareContours,
  CONTOUR_STEPS,
  divergenceHint,
  targetSamples,
  targetTrajectory,
  toContour,
  zoneLabel,
} from './toneContour'
import type { Tone } from '../types'

const TONES: Tone[] = ['1', '2', '3', '4', '5']

function flat(freq: number, frames = 40): number[] {
  return Array.from({ length: frames }, () => freq)
}

function dipping(freq: number, frames = 40): number[] {
  const half = Math.floor(frames / 2)
  return [
    ...Array.from({ length: half }, (_, i) => freq * Math.pow(2, -(i / (half - 1)) * 4 / 12)),
    ...Array.from({ length: frames - half }, (_, i) =>
      freq * Math.pow(2, (-4 + (i / (frames - half - 1)) * 9) / 12),
    ),
  ]
}

describe('target templates', () => {
  it('returns the requested number of samples spanning normalized time', () => {
    for (const tone of TONES) {
      const samples = targetSamples(tone, 32)
      expect(samples).toHaveLength(32)
      expect(samples[0]).toBeCloseTo(targetTrajectory(tone, 0), 5)
      expect(samples[31]).toBeCloseTo(targetTrajectory(tone, 1), 5)
    }
  })

  it('tone 1 is flat, tone 2 rises, tone 4 falls', () => {
    const flat1 = targetSamples('1')
    expect(Math.max(...flat1)).toBe(0)

    const rise = targetSamples('2')
    expect(rise[rise.length - 1]).toBeGreaterThan(rise[0])

    const fall = targetSamples('4')
    expect(fall[fall.length - 1]).toBeLessThan(fall[0])
  })

  it('tone 3 dips below its onset then rises above it', () => {
    const dip = targetSamples('3')
    const min = Math.min(...dip)
    expect(min).toBeLessThan(0)
    expect(dip[dip.length - 1]).toBeGreaterThan(0)
    expect(dip[dip.length - 1]).toBeGreaterThan(min)
  })
})

describe('toContour', () => {
  it('normalizes any track length to CONTOUR_STEPS samples', () => {
    expect(toContour(flat(180, 7))).toHaveLength(CONTOUR_STEPS)
    expect(toContour(flat(180, 250))).toHaveLength(CONTOUR_STEPS)
  })

  it('returns empty for no voiced input', () => {
    expect(toContour([0, 0, 0])).toEqual([])
  })

  it('flattens a steady pitch to ~0 semitones (base-relative)', () => {
    const contour = toContour(flat(220))
    for (const v of contour) expect(Math.abs(v)).toBeLessThan(0.2)
  })

  it('is speaker-relative: same shape at different Hz resamples identically', () => {
    const low = toContour(dipping(105))
    const high = toContour(dipping(231))
    high.forEach((v, i) => expect(v).toBeCloseTo(low[i], 6))
  })
})

describe('compareContours', () => {
  it('reports near-zero error for a contour matching the target', () => {
    // Build the tone-3 target as Hz around 180 so toContour reproduces it.
    const target = targetSamples('3')
    const pitches = target.map(s => 180 * Math.pow(2, s / 12))
    const result = compareContours(toContour(pitches), '3')

    expect(result).not.toBeNull()
    expect(result!.meanAbsError).toBeLessThan(0.5)
    expect(result!.aligned).toHaveLength(CONTOUR_STEPS)
  })

  it('is invariant to a constant pitch offset (different speaker base)', () => {
    const target = targetSamples('3')
    const shifted = target.map(s => 180 * Math.pow(2, (s + 5) / 12)) // +5 semitones overall
    const result = compareContours(toContour(shifted), '3')

    expect(result!.meanAbsError).toBeLessThan(0.5)
  })

  it('flags the middle third when only the middle diverges', () => {
    const target = targetSamples('3')
    const broken = target.map((s, i) => {
      const t = i / (target.length - 1)
      return 180 * Math.pow(2, (t > 0.35 && t < 0.65 ? s + 4 : s) / 12)
    })
    const result = compareContours(toContour(broken), '3')

    expect(result!.zone).toBe('mid')
    expect(result!.meanAbsError).toBeGreaterThan(1)
  })

  it('flags the opening third when the contour moves too early', () => {
    // Target tone 4 falls across 0–0.6; this attempt dumps the whole fall in
    // the first fifth and then lies flat — onset region diverges most.
    const target = targetSamples('4')
    const broken = target.map((s, i) => {
      const t = i / (target.length - 1)
      const early = -6 * Math.min(1, t / 0.2)
      return 180 * Math.pow(2, (t < 0.5 ? early : s) / 12)
    })
    const result = compareContours(toContour(broken), '4')

    expect(result!.zone).toBe('start')
  })

  it('returns null for an empty contour', () => {
    expect(compareContours([], '1')).toBeNull()
  })
})

describe('zoneLabel and divergenceHint', () => {
  it('names every zone', () => {
    expect(zoneLabel('start')).toBe('opening')
    expect(zoneLabel('mid')).toBe('middle')
    expect(zoneLabel('end')).toBe('ending')
  })

  it('gives actionable advice for every tone and zone', () => {
    for (const tone of TONES) {
      for (const zone of ['start', 'mid', 'end'] as const) {
        const hint = divergenceHint(tone, zone)
        expect(hint).toContain(zoneLabel(zone))
        expect(hint.length).toBeGreaterThan(20)
      }
    }
  })
})
