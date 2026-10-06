import { describe, it, expect, vi, afterEach } from 'vitest'
import { recognizeGoogleIme } from './googleIme'
import type { Stroke } from './handwriting'

afterEach(() => {
  vi.unstubAllGlobals()
})

const stroke: Stroke = [
  { x: 1.4, y: 2.6 },
  { x: 3, y: 4 },
]

describe('recognizeGoogleIme', () => {
  it('returns nothing without touching the network for empty ink', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await recognizeGoogleIme([], { width: 300, height: 200 })).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts strokes as IME ink and returns the candidates', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(['SUCCESS', [['id1', ['你好', '您好']]]]),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const hits = await recognizeGoogleIme([stroke], { width: 300, height: 200 })
    expect(hits).toEqual(['你好', '您好'])

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('inputtools')
    const body = JSON.parse(String(init?.body))
    expect(body.requests[0].language).toBe('zh-CN')
    expect(body.requests[0].writing_guide).toEqual({
      writing_area_width: 300,
      writing_area_height: 200,
    })
    // Ink is `[xs, ys, ts]` triples; xs/ys round to integers, ts are spaced.
    expect(body.requests[0].ink).toEqual([[[1, 3], [3, 4], [0, 30]]])
  })

  it('throws on a failed HTTP status so callers fall back', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })),
    )
    await expect(recognizeGoogleIme([stroke], { width: 10, height: 10 })).rejects.toThrow(
      '503',
    )
  })

  it('throws when the endpoint answers a non-SUCCESS payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(['ERROR_QUOTA', null]),
        }),
      ),
    )
    await expect(recognizeGoogleIme([stroke], { width: 10, height: 10 })).rejects.toThrow(
      'unsuccessful',
    )
  })
})
