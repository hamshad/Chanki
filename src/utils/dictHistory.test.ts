import { describe, it, expect, beforeEach } from 'vitest'
import { loadHistory, pushHistory, clearHistory } from './dictHistory'

const KEY = 'chanki.dict.history'

beforeEach(() => localStorage.clear())

describe('dictionary search history (device-local)', () => {
  it('prepends and dedupes', () => {
    pushHistory('你')
    pushHistory('好')
    expect(pushHistory('你')).toEqual(['你', '好'])
    expect(loadHistory()).toEqual(['你', '好'])
  })

  it('ignores blank queries', () => {
    expect(pushHistory('   ')).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('caps the list at 12 entries', () => {
    for (let i = 0; i < 20; i++) pushHistory(`q${i}`)
    const history = loadHistory()
    expect(history).toHaveLength(12)
    expect(history[0]).toBe('q19')
  })

  it('trims surrounding whitespace', () => {
    pushHistory('  nihao  ')
    expect(loadHistory()).toEqual(['nihao'])
  })

  it('survives corrupt storage instead of crashing', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadHistory()).toEqual([])
    localStorage.setItem(KEY, '{"a":1}')
    expect(loadHistory()).toEqual([])
    expect(pushHistory('你')).toEqual(['你'])
  })

  it('clear empties storage', () => {
    pushHistory('你')
    clearHistory()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(loadHistory()).toEqual([])
  })
})
