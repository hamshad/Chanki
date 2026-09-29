import { describe, it, expect } from 'vitest'
import {
  analyzeCapture,
  calculateToneScore,
  classifyFrame,
  isVoicedPitch,
  toSemitones,
  MAX_VOICED_HZ,
  MIN_VOICED_HZ,
} from './scoring'
import type { Tone } from '../types'
import type { Frame } from './scoring'

const TONES: Tone[] = ['1', '2', '3', '4', '5']

/** Flat high contour (tone 1) around a base frequency in Hz. */
function flat(base: number, frames = 30): number[] {
  return Array.from({ length: frames }, (_, i) => base * (1 + 0.01 * Math.sin(i / 3)))
}

/** Rising contour (tone 2): +4 semitones over the capture. */
function rising(base: number, frames = 30): number[] {
  return Array.from({ length: frames }, (_, i) => base * Math.pow(2, (i / (frames - 1)) * 4 / 12))
}

/** Falling contour (tone 4): -5 semitones over the capture. */
function falling(base: number, frames = 30): number[] {
  return Array.from({ length: frames }, (_, i) => base * Math.pow(2, -(i / (frames - 1)) * 5 / 12))
}

/** Dipping contour (tone 3): -4 semitones then +5 semitones. */
function dipping(base: number, frames = 30): number[] {
  const half = Math.floor(frames / 2)
  return [
    ...Array.from({ length: half }, (_, i) => base * Math.pow(2, -(i / (half - 1)) * 4 / 12)),
    ...Array.from({ length: frames - half }, (_, i) =>
      base * Math.pow(2, (-4 + (i / (frames - half - 1)) * 9) / 12),
    ),
  ]
}

function voicedFrame(freq: number, clarity = 0.95, rms = 0.3): Frame {
  return { freq, clarity, rms }
}

describe('toSemitones', () => {
  it('measures every pitch relative to the first valid pitch', () => {
    const semitones = toSemitones([220, 440])
    expect(semitones[0]).toBeCloseTo(0, 5)
    expect(semitones[1]).toBeCloseTo(12, 5)
  })

  it('is invariant to a global pitch scale (speaker-relative)', () => {
    const low = toSemitones(rising(110))
    const high = toSemitones(rising(240))
    expect(high.length).toBe(low.length)
    high.forEach((s, i) => expect(s).toBeCloseTo(low[i], 9))
  })

  it('honours an explicit calibrated base frequency', () => {
    const semitones = toSemitones([220, 246.94], 110)
    expect(semitones[0]).toBeCloseTo(12, 3)
    expect(semitones[1]).toBeCloseTo(14, 2)
  })

  it('drops silence and out-of-band pitches', () => {
    expect(toSemitones([0, 0, MIN_VOICED_HZ - 1])).toEqual([])
    expect(toSemitones([0, 220, MAX_VOICED_HZ + 1])).toEqual([0])
  })
})

describe('calculateToneScore speaker-relative invariance', () => {
  const contours: Record<string, (base: number) => number[]> = {
    '1': flat,
    '2': rising,
    '3': dipping,
    '4': falling,
    '5': flat,
  }

  it.each(TONES)('tone %s scores identically at any absolute pitch', tone => {
    const shape = contours[tone]
    const reference = calculateToneScore(shape(110), tone)

    for (const base of [85, 110, 180, 240, 340]) {
      expect(calculateToneScore(shape(base), tone)).toBe(reference)
    }
  })

  it.each(TONES)('tone %s scores identically under a calibrated base offset', tone => {
    const shape = contours[tone]
    const raw = calculateToneScore(shape(220), tone)
    const calibrated = calculateToneScore(shape(220), tone, 110)
    expect(calibrated).toBe(raw)
  })

  it('scores the same shape identically for male and female speakers', () => {
    const male = calculateToneScore(dipping(105), '3')
    const female = calculateToneScore(dipping(225), '3')
    expect(male).toBe(female)
  })
})

describe('calculateToneScore tone discrimination', () => {
  it('rises for tone 2 and falls for tone 4', () => {
    const up = rising(180)
    const down = falling(180)

    expect(calculateToneScore(up, '2')).toBeGreaterThan(calculateToneScore(up, '4'))
    expect(calculateToneScore(down, '4')).toBeGreaterThan(calculateToneScore(down, '2'))
  })

  it('prefers a level contour for tone 1', () => {
    const level = flat(180)
    expect(calculateToneScore(level, '1')).toBeGreaterThan(80)
    expect(calculateToneScore(falling(180), '1')).toBeLessThan(calculateToneScore(level, '1'))
  })

  it('prefers a dip-then-rise for tone 3', () => {
    const dip = dipping(180)
    expect(calculateToneScore(dip, '3')).toBeGreaterThan(calculateToneScore(dip, '4'))
    expect(calculateToneScore(dip, '3')).toBeGreaterThan(calculateToneScore(dip, '2'))
  })

  it('penalizes a rise that dips early on tone 2', () => {
    const cleanRise = rising(180)
    const half = Math.floor(cleanRise.length / 2)
    const dippedRise = cleanRise.map((p, i) =>
      i > 0 && i < half ? p * Math.pow(2, -2 / 12) : p,
    )
    expect(calculateToneScore(dippedRise, '2')).toBeLessThan(calculateToneScore(cleanRise, '2'))
  })

  it('scores all tones in 0-100', () => {
    const samples = [flat(120), rising(120), dipping(120), falling(120), [120, 0, 120, 0]]
    for (const sample of samples) {
      for (const tone of TONES) {
        const score = calculateToneScore(sample, tone)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('calculateToneScore noise and silence states', () => {
  it('returns 0 for silence (no voiced frames)', () => {
    expect(calculateToneScore(Array(30).fill(0), '1')).toBe(0)
  })

  it('returns 0 when too few voiced frames survive filtering', () => {
    expect(calculateToneScore([0, 0, 180, 0, 180], '1')).toBe(0)
  })

  it('ignores interleaved silence inside a real utterance', () => {
    const withGaps = flat(180).map((p, i) => (i % 4 === 0 ? 0 : p))
    expect(calculateToneScore(withGaps, '1')).toBeGreaterThan(80)
  })
})

describe('classifyFrame / isVoicedPitch', () => {
  it('accepts high-clarity pitches inside the voice band', () => {
    expect(isVoicedPitch(180, 0.9)).toBe(true)
    expect(isVoicedPitch(40, 0.95)).toBe(false)
    expect(isVoicedPitch(180, 0.4)).toBe(false)
  })

  it('separates voiced, noisy, and silent frames', () => {
    expect(classifyFrame(voicedFrame(160))).toBe('voiced')
    expect(classifyFrame({ freq: 0, clarity: 0.1, rms: 0.25 })).toBe('noise')
    expect(classifyFrame({ freq: 0, clarity: 0, rms: 0 })).toBe('silence')
  })
})

describe('analyzeCapture', () => {
  it('reports silence when nothing is voiced', () => {
    const frames: Frame[] = Array.from({ length: 40 }, () => ({ freq: 0, clarity: 0, rms: 0 }))
    const analysis = analyzeCapture(frames)
    expect(analysis.state).toBe('silence')
    expect(analysis.voicedRatio).toBe(0)
    expect(analysis.baseFreq).toBeNull()
  })

  it('reports too-short for a clip with almost no frames', () => {
    expect(analyzeCapture([voicedFrame(150)]).state).toBe('too-short')
  })

  it('reports noisy when background dominates', () => {
    const frames: Frame[] = [
      ...Array.from({ length: 10 }, () => voicedFrame(150)),
      ...Array.from({ length: 40 }, () => ({ freq: 0, clarity: 0.2, rms: 0.3 })),
    ]
    expect(analyzeCapture(frames).state).toBe('noisy')
  })

  it('reports ok and a median base frequency for clear speech', () => {
    const frames: Frame[] = [
      voicedFrame(148),
      voicedFrame(152),
      voicedFrame(150),
      voicedFrame(151),
      voicedFrame(149),
      { freq: 0, clarity: 0.2, rms: 0.3 },
    ]
    const analysis = analyzeCapture(frames)
    expect(analysis.state).toBe('ok')
    expect(analysis.baseFreq).toBe(150)
    expect(analysis.voicedFrames).toBe(5)
    expect(analysis.noiseFrames).toBe(1)
  })
})
