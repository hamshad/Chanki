export interface SplitMeaning {
  /** Non-classifier senses — the card's primary meaning. */
  main: string
  /** Classifier senses pulled out as extra info (e.g. 本, 点, 块). */
  measureWords: string[]
}

const MEASURE_WORD_SENSE = /^(classifier|measure word)\b/i

export interface MeaningTextStyle {
  fontSize: string
  lineHeight: number
}

/**
 * Scales meaning typography to its length so ALL senses stay visible in a
 * fixed-height card — long entries (号, 点: 500+ chars) shrink instead of
 * scrolling or getting truncated.
 */
export function meaningTextStyle(length: number): MeaningTextStyle {
  if (length <= 120) return { fontSize: 'clamp(1.15rem, 4.6vw, 1.45rem)', lineHeight: 1.5 }
  if (length <= 260) return { fontSize: 'clamp(1rem, 4vw, 1.2rem)', lineHeight: 1.45 }
  if (length <= 420) return { fontSize: 'clamp(0.86rem, 3.5vw, 1.05rem)', lineHeight: 1.4 }
  if (length <= 520) return { fontSize: 'clamp(0.78rem, 3.2vw, 0.92rem)', lineHeight: 1.35 }
  return { fontSize: 'clamp(0.72rem, 3vw, 0.85rem)', lineHeight: 1.3 }
}

/**
 * Splits a sourced CC-CEDICT meaning string into primary senses and
 * measure-word senses. Measure words are extra reference info, not the
 * core meaning — the review card renders them as a separate chip row.
 *
 * If every sense is a measure word (e.g. 些), the full string stays in
 * `main` and `measureWords` is empty — the card must never show an
 * empty meaning side.
 */
export function splitMeasureWords(meaning: string): SplitMeaning {
  const senses = meaning
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  const main: string[] = []
  const measureWords: string[] = []
  for (const sense of senses) {
    if (MEASURE_WORD_SENSE.test(sense)) measureWords.push(sense)
    else main.push(sense)
  }

  if (main.length === 0) return { main: meaning, measureWords: [] }
  return { main: main.join('; '), measureWords }
}
