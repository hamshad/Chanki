import { describe, it, expect, beforeEach } from 'vitest'
import { loadChatLang, saveChatLang } from './chatLang'

beforeEach(() => {
  localStorage.clear()
})

describe('chat answer language', () => {
  it('defaults to English, rejects garbage', () => {
    expect(loadChatLang()).toBe('en')
    localStorage.setItem('chanki.chat.lang', 'devanagari??')
    expect(loadChatLang()).toBe('en')
  })

  it('persists the choice device-locally', () => {
    saveChatLang('hi-Latn')
    expect(loadChatLang()).toBe('hi-Latn')
    expect(localStorage.getItem('chanki.chat.lang')).toBe('hi-Latn')
    saveChatLang('en')
    expect(loadChatLang()).toBe('en')
  })
})
