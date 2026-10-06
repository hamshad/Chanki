import { describe, it, expect, afterEach } from 'vitest'
import { db } from './db'
import {
  MAX_STORED_MESSAGES,
  clearThread,
  decodeThread,
  encodeThread,
  loadThread,
  saveThread,
  trimThread,
} from './chatThread'

afterEach(async () => {
  await db.meta.delete('chat.thread')
})

describe('chat thread encoding', () => {
  it('round-trips user/assistant messages through role codes', () => {
    const msgs = [
      { role: 'user' as const, text: '你好是什么意思?' },
      { role: 'assistant' as const, text: 'hello' },
    ]
    expect(encodeThread(msgs)).toBe('[["u","你好是什么意思?"],["a","hello"]]')
    expect(decodeThread(encodeThread(msgs))).toEqual(msgs)
  })

  it('decodes garbage, corrupt rows and foreign shapes to []', () => {
    expect(decodeThread(undefined)).toEqual([])
    expect(decodeThread(null)).toEqual([])
    expect(decodeThread(42)).toEqual([])
    expect(decodeThread('not json')).toEqual([])
    expect(decodeThread('{"u":"hi"}')).toEqual([])
    expect(decodeThread([{ role: 'user', text: 'hi' }])).toEqual([])
    // Skips bad tuples, keeps good ones.
    expect(
      decodeThread('[["x","no"],["u","yes"],[1,2],["a",""],["a","ok"]]'),
    ).toEqual([
      { role: 'user', text: 'yes' },
      { role: 'assistant', text: 'ok' },
    ])
  })

  it('trims to the newest MAX_STORED_MESSAGES', () => {
    const msgs = Array.from({ length: MAX_STORED_MESSAGES + 10 }, (_, i) => ({
      role: 'user' as const,
      text: `m${i}`,
    }))
    expect(trimThread(msgs)).toHaveLength(MAX_STORED_MESSAGES)
    expect(trimThread(msgs)[0].text).toBe('m10')
  })
})

describe('chat thread persistence', () => {
  it('loads [] when nothing was saved, saves and reloads one row', async () => {
    await expect(loadThread()).resolves.toEqual([])
    await saveThread([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ])
    await expect(loadThread()).resolves.toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ])
    // One compact row — no per-message documents.
    expect((await db.meta.get('chat.thread'))?.value).toBe('[["u","hi"],["a","hello"]]')
  })

  it('clearThread wipes the row', async () => {
    await saveThread([{ role: 'user', text: 'hi' }])
    await clearThread()
    await expect(loadThread()).resolves.toEqual([])
  })
})
