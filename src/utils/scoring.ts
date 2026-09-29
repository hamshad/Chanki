import type { Tone } from '../types'

/** Voiced band for Mandarin speech — clips octave errors and non-vocal noise. */
export const MIN_VOICED_HZ = 50
export const MAX_VOICED_HZ = 1000

/** MPM clarity gate. Frames below this are unvoiced (silence/fricative). */
export const MIN_CLARITY = 0.8

/** RMS above this (0..1) but unvoiced counts as background noise. */
export const NOISE_RMS = 0.02

/** Minimum voiced frames before a shape score is meaningful. */
export const MIN_SCORED_FRAMES = 5

/** Minimum share of voiced frames for a capture to count as usable speech. */
const MIN_VOICED_RATIO = 0.15

/** Minimum share of noise frames (relative to all frames) to flag a noisy room. */
const NOISY_RATIO = 0.3

export type CaptureState = 'too-short' | 'silence' | 'noisy' | 'ok'

export type FrameClass = 'voiced' | 'noise' | 'silence'

export interface Frame {
  /** Detected fundamental in Hz; 0 when the frame is unvoiced. */
  freq: number
  /** MPM clarity, 0..1. */
  clarity: number
  /** Root-mean-square amplitude of the frame, 0..1. */
  rms: number
}

export interface CaptureAnalysis {
  state: CaptureState
  frames: number
  voicedFrames: number
  noiseFrames: number
  voicedRatio: number
  noiseRatio: number
  /** Median voiced pitch — stable base frequency for speaker-relative scoring. */
  baseFreq: number | null
}

export function isVoicedPitch(freq: number, clarity: number): boolean {
  return clarity >= MIN_CLARITY && freq >= MIN_VOICED_HZ && freq <= MAX_VOICED_HZ
}

export function classifyFrame(frame: Frame): FrameClass {
  if (isVoicedPitch(frame.freq, frame.clarity)) return 'voiced'
  if (frame.rms >= NOISE_RMS) return 'noise'
  return 'silence'
}

export function analyzeCapture(frames: Frame[]): CaptureAnalysis {
  let voicedFrames = 0
  let noiseFrames = 0
  const voicedFreqs: number[] = []

  for (const frame of frames) {
    const cls = classifyFrame(frame)
    if (cls === 'voiced') {
      voicedFrames++
      voicedFreqs.push(frame.freq)
    } else if (cls === 'noise') {
      noiseFrames++
    }
  }

  const total = frames.length
  const voicedRatio = total === 0 ? 0 : voicedFrames / total
  const noiseRatio = total === 0 ? 0 : noiseFrames / total

  let state: CaptureState
  if (total < MIN_SCORED_FRAMES) {
    state = 'too-short'
  } else if (voicedRatio >= MIN_VOICED_RATIO && noiseRatio >= NOISY_RATIO) {
    state = 'noisy'
  } else if (voicedRatio >= MIN_VOICED_RATIO) {
    state = 'ok'
  } else if (noiseRatio >= NOISY_RATIO) {
    state = 'noisy'
  } else {
    state = 'silence'
  }

  return {
    state,
    frames: total,
    voicedFrames,
    noiseFrames,
    voicedRatio,
    noiseRatio,
    baseFreq: median(voicedFreqs),
  }
}

/**
 * Maps absolute Hz values to semitones relative to a base frequency.
 *
 * Scaling every pitch by the same factor (a different speaker) shifts the whole
 * vector by a constant and leaves all differences intact, which is what makes
 * the downstream shape metrics speaker-relative.
 */
export function toSemitones(pitches: number[], baseFreq?: number): number[] {
  const valid = pitches.filter(p => p >= MIN_VOICED_HZ && p <= MAX_VOICED_HZ)
  if (valid.length === 0) return []
  const base = baseFreq && baseFreq >= MIN_VOICED_HZ && baseFreq <= MAX_VOICED_HZ
    ? baseFreq
    : valid[0]
  return valid.map(p => 12 * Math.log2(p / base))
}

/**
 * Shape score (0-100) for a pitch track against a target Mandarin tone.
 *
 * Every metric is built from differences (span, delta, dip depth), so a tone
 * sung an octave higher — or scored against a calibrated base from another
 * utterance — returns the same score. Absolute Hz never enters the math.
 */
export function calculateToneScore(
  pitches: number[],
  targetTone: Tone,
  baseFreq?: number,
): number {
  const semitones = toSemitones(pitches, baseFreq)

  if (semitones.length < MIN_SCORED_FRAMES) {
    return 0
  }

  const start = semitones[0]
  const end = semitones[semitones.length - 1]
  const min = Math.min(...semitones)
  const max = Math.max(...semitones)

  const overallDelta = end - start
  const span = max - min
  const dipDepth = Math.max(0, start - min)

  let score: number

  switch (targetTone) {
    case '1': {
      // Tone 1 (5-5): high and level — penalize span only, never absolute pitch.
      score = 100 - span * 20
      break
    }

    case '2': {
      // Tone 2 (3-5): must rise overall; early dips get penalized.
      if (overallDelta <= 0) {
        score = 0
      } else {
        score = Math.min(100, (overallDelta / 4) * 100) - Math.min(50, dipDepth * 15)
      }
      break
    }

    case '3': {
      // Tone 3 (2-1-4): dip below the onset, then rise.
      const dip = min - start
      const rise = end - min
      if (dip < 0 && rise > 0) {
        score = 60 + Math.min(40, (-dip + rise) * 10)
      } else if (dip < 0) {
        score = 50 + Math.min(30, -dip * 10)
      } else {
        score = 0
      }
      break
    }

    case '4': {
      // Tone 4 (5-1): strong negative overall delta.
      if (overallDelta < 0) {
        score = Math.min(100, (-overallDelta / 5) * 100)
      } else {
        score = 0
      }
      break
    }

    case '5': {
      // Neutral: short and small movement — span only.
      score = 100 - span * 15
      break
    }

    default:
      return 0
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
