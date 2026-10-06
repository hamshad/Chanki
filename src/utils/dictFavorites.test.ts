import { describe, it, expect, beforeEach } from 'vitest'
import { loadFavorites, toggleFavorite } from './dictFavorites'

beforeEach(() => {
  localStorage.clear()
})

describe('dictFavorites', () => {
  it('starts empty and tolerates corrupt storage', () => {
    expect(loadFavorites()).toEqual([])
    localStorage.setItem('chanki.dict.favorites', 'not-json{')
    expect(loadFavorites()).toEqual([])
  })

  it('stars and unstars an entry', () => {
    expect(toggleFavorite('你好')).toEqual(['你好'])
    expect(loadFavorites()).toEqual(['你好'])
    expect(toggleFavorite('你好')).toEqual([])
  })

  it('keeps newest first, unstarring removes, re-starring goes to front', () => {
    toggleFavorite('你')
    toggleFavorite('好')
    expect(loadFavorites()).toEqual(['好', '你'])
    toggleFavorite('你')
    expect(loadFavorites()).toEqual(['好'])
    toggleFavorite('你')
    expect(loadFavorites()).toEqual(['你', '好'])
  })

  it('persists only in localStorage, device-local', () => {
    toggleFavorite('你好')
    expect(localStorage.getItem('chanki.dict.favorites')).toContain('你好')
  })
})
