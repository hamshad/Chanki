import type { Tone } from '../types'
import { toSemitones } from './scoring'

/** Number of samples both user and target contours are normalized to. */
export const CONTOUR_STEPS = 64

export type ContourZone = 'start' | 'mid' | 'end'

/**
 * Target semitone trajectory for a tone over normalized time t ∈ [0, 1].
 *
 * Templates are shape-only (start at 0), since scoring and comparison are
 * speaker-relative: tone 1 level, tone 2 rise +4, tone 3 dip -4 then rise to
 * +2, tone 4 sharp fall -6, tone 5 slight fall -1.5.
 */
export function targetTrajectory(tone: Tone, t: number): number {
  const x = Math.min(1, Math.max(0, t))
  switch (tone) {
    case '1':
      return 0
    case '2':
      return 4 * (0.65 * x + 0.35 * x * x)
    case '3':
      return x < 0.5 ? -4 * (x / 0.5) : -4 + 6 * ((x - 0.5) / 0.5)
    case '4':
      return -6 * Math.min(1, x / 0.6)
    case '5':
      return -1.5 * x
    default:
      return 0
  }
}

export function targetSamples(tone: Tone, steps = CONTOUR_STEPS): number[] {
  return Array.from({ length: steps }, (_, i) => targetTrajectory(tone, i / (steps - 1)))
}

/**
 * Time-normalizes a raw pitch track into `steps` semitone samples.
 *
 * Removes unvoiced gaps via toSemitones' band filter, then linearly resamples
 * so a short and a long attempt of the same shape become comparable curves.
 */
export function toContour(pitches: number[], baseFreq?: number, steps = CONTOUR_STEPS): number[] {
  const semis = toSemitones(pitches, baseFreq)
  if (semis.length === 0) return []
  if (semis.length === 1) return Array.from({ length: steps }, () => semis[0])

  return Array.from({ length: steps }, (_, i) => {
    const pos = (i * (semis.length - 1)) / (steps - 1)
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    const frac = pos - lo
    return semis[lo] * (1 - frac) + semis[hi] * frac
  })
}

export interface Divergence {
  /** Absolute error per sample, in semitones. */
  errors: number[]
  /** Mean absolute error across the whole contour. */
  meanAbsError: number
  /** Third of the contour that diverged most (by mean error). */
  zone: ContourZone
  /** Mean error inside the worst zone. */
  zoneError: number
  /** Sample index of the single largest error. */
  worstIndex: number
  /** User contour after onset alignment (baseline removed), for drawing. */
  aligned: number[]
}

/** Compares a normalized user contour against the target template. */
export function compareContours(
  user: number[],
  tone: Tone,
  steps = CONTOUR_STEPS,
): Divergence | null {
  if (user.length === 0) return null

  const target = targetSamples(tone, steps)

  // Onset alignment: remove the constant offset so a different absolute base
  // (or a calibration base from another utterance) cannot skew the comparison.
  const baselineWindow = user.slice(0, Math.max(1, Math.floor(steps * 0.1)))
  const baseline = baselineWindow.reduce((a, b) => a + b, 0) / baselineWindow.length
  const aligned = user.map(v => v - baseline)

  const errors = aligned.map((v, i) => Math.abs(v - target[i]))
  const meanAbsError = errors.reduce((a, b) => a + b, 0) / errors.length

  const third = Math.max(1, Math.floor(steps / 3))
  const zoneSpans: Record<ContourZone, [number, number]> = {
    start: [0, third],
    mid: [third, third * 2],
    end: [third * 2, steps],
  }

  let zone: ContourZone = 'start'
  let zoneError = -Infinity
  for (const name of ['start', 'mid', 'end'] as const) {
    const [from, to] = zoneSpans[name]
    const slice = errors.slice(from, to)
    if (slice.length === 0) continue
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length
    if (avg > zoneError) {
      zoneError = avg
      zone = name
    }
  }

  let worstIndex = 0
  errors.forEach((err, i) => {
    if (err > errors[worstIndex]) worstIndex = i
  })

  return { errors, meanAbsError, zone, zoneError, worstIndex, aligned }
}

export function zoneLabel(zone: ContourZone): string {
  return zone === 'start' ? 'opening' : zone === 'mid' ? 'middle' : 'ending'
}

/** Plain-language advice for where the attempt diverged. */
export function divergenceHint(tone: Tone, zone: ContourZone): string {
  const opening = {
    '1': 'start right on your steady high pitch — no jump at the onset',
    '2': 'start low and level; the rise comes after',
    '3': 'start mid, then commit to the dip',
    '4': 'start high — the fall has nowhere to go from below',
    '5': 'start mid and keep it light',
  }[tone]

  const middle = {
    '1': 'keep the middle flat — you drifted off level',
    '2': 'keep climbing through the middle — you plateaued',
    '3': 'deepen the dip in the middle, then lift',
    '4': 'commit to the fall through the middle',
    '5': 'keep the middle steady and short',
  }[tone]

  const ending = {
    '1': 'hold level to the end',
    '2': 'finish high — land the top of the rise',
    '3': 'finish on the rise, above where you started',
    '4': 'land low — finish the fall completely',
    '5': 'fade out gently',
  }[tone]

  const advice = zone === 'start' ? opening : zone === 'mid' ? middle : ending
  return `Worst in the ${zoneLabel(zone)}: ${advice}.`
}
