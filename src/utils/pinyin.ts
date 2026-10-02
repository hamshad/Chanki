/** Pinyin tone helpers (ported from scripts/data/lib.mjs — admin card authoring). */

const MARKED_TONES: Record<string, number> = {
  a: 1, e: 1, i: 1, o: 1, u: 1, ü: 1,
  á: 2, é: 2, í: 2, ó: 2, ú: 2, ǘ: 2,
  ǎ: 3, ě: 3, ǐ: 3, ǒ: 3, ǔ: 3, ǚ: 3,
  à: 4, è: 4, ì: 4, ò: 4, ù: 4, ǜ: 4,
}

/** Tone of first syllable of tone-marked pinyin ('ài' -> '1'). Neutral -> '5'. */
export function toneFromMarked(markedPinyin: string | undefined): '1' | '2' | '3' | '4' | '5' {
  if (!markedPinyin) return '5'
  const first = markedPinyin.trim().split(/\s+/)[0]
  for (const ch of first) {
    const tone = MARKED_TONES[ch]
    if (tone) return String(tone) as '1' | '2' | '3' | '4' | '5'
  }
  return '5'
}

/** Tone of first syllable of numeric pinyin ('ai4' -> '1'). Neutral/no-digit -> '5'. */
export function toneFromNumeric(numericPinyin: string | undefined): '1' | '2' | '3' | '4' | '5' {
  if (!numericPinyin) return '5'
  const first = numericPinyin.trim().split(/\s+/)[0]
  const m = first.match(/([1-5])$/)
  return (m ? m[1] : '5') as '1' | '2' | '3' | '4' | '5'
}
