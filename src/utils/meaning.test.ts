import { describe, it, expect } from 'vitest'
import { splitMeasureWords, meaningTextStyle } from './meaning'

describe('meaningTextStyle', () => {
  it('gives short meanings the largest type', () => {
    const style = meaningTextStyle(80)
    expect(style.fontSize).toContain('1.15rem')
    expect(style.lineHeight).toBe(1.5)
  })

  it('shrinks type as the meaning grows (5 tiers)', () => {
    const sizes = [100, 200, 300, 450, 700].map((n) => meaningTextStyle(n).fontSize)
    const unique = new Set(sizes)
    expect(unique.size).toBe(5)
    // monotonically non-increasing minimum sizes
    const mins = sizes.map((s) => parseFloat(s.match(/([\d.]+)rem/)![1]))
    for (let i = 1; i < mins.length; i++) expect(mins[i]).toBeLessThan(mins[i - 1])
  })

  it('tightens line height for the densest tier', () => {
    expect(meaningTextStyle(600).lineHeight).toBe(1.3)
    expect(meaningTextStyle(600).fontSize).toContain('0.72rem')
  })
})

describe('splitMeasureWords', () => {
  it('leaves plain meanings untouched', () => {
    expect(splitMeasureWords('China; Chinese')).toEqual({
      main: 'China; Chinese',
      measureWords: [],
    })
  })

  it('pulls classifier senses out of a mixed meaning', () => {
    const result = splitMeasureWords(
      'root; basis; origin; classifier for books, periodicals, files etc; this; the current',
    )
    expect(result.measureWords).toEqual([
      'classifier for books, periodicals, files etc',
    ])
    expect(result.main).toBe('root; basis; origin; this; the current')
  })

  it('handles the "measure word" phrasing (下)', () => {
    const result = splitMeasureWords(
      'down; measure word to show the frequency of an action; below; under',
    )
    expect(result.measureWords).toEqual([
      'measure word to show the frequency of an action',
    ])
    expect(result.main).toBe('down; below; under')
  })

  it('keeps the full meaning when every sense is a measure word (些)', () => {
    const onlyMw =
      'classifier indicating a small amount or small number greater than 1: some, a few, several'
    expect(splitMeasureWords(onlyMw)).toEqual({
      main: onlyMw,
      measureWords: [],
    })
  })

  it('is case-insensitive on the classifier keyword', () => {
    const result = splitMeasureWords('Classifier for sheets; flat thing')
    expect(result.measureWords).toEqual(['Classifier for sheets'])
    expect(result.main).toBe('flat thing')
  })
})
