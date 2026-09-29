import type { Tone } from '../types'

/**
 * Returns the CSS variable name for a given tone.
 * Tones: 1 (Flat), 2 (Rising), 3 (Dip-Rise), 4 (Falling), 5 (Neutral)
 */
export function getToneColorVar(tone: Tone): string {
  return `var(--tone-${tone})`
}

/**
 * Validates if a string is a valid tone.
 */
export function isValidTone(tone: string): tone is Tone {
  return ['1', '2', '3', '4', '5'].includes(tone)
}
