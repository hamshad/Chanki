import { describe, it, expect, vi, afterEach } from 'vitest'
import { getJson, ApiError } from './http'
import { searchExamples, findWordAudio } from './tatoeba'
import * as z from 'zod'

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('getJson', () => {
  it('parses and validates successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' })))
    const schema = z.object({ hello: z.string() })
    await expect(getJson('https://x.test/a', schema)).resolves.toEqual({ hello: 'world' })
  })

  it('soft-fails (null) on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)))
    await expect(getJson('https://x.test/missing', z.object({}))).resolves.toBeNull()
  })

  it('soft-fails (null) on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    await expect(getJson('https://x.test/down', z.object({}))).resolves.toBeNull()
  })

  it('soft-fails (null) on schema mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ wrong: true })))
    await expect(getJson('https://x.test/bad', z.object({ hello: z.string() }))).resolves.toBeNull()
  })

  it('throws ApiError on non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)))
    await expect(getJson('https://x.test/err', z.object({}))).rejects.toBeInstanceOf(ApiError)
  })
})

describe('tatoeba API', () => {
  const sentencePayload = {
    data: [
      {
        id: 42,
        text: '我爱你。',
        script: 'Hans',
        translations: [
          { id: 1, text: 'I love you.', lang: 'eng' },
          { id: 2, text: 'Je t\'aime.', lang: 'fra' },
        ],
        audios: [{ id: 7, license: 'CC BY 2.0 FR', download_url: '/v1/audio/7/file' }],
      },
      { id: 43, text: '他爱书。', script: 'Hant', translations: [], audios: [] },
    ],
  }

  it('maps sentences to examples with English translation + licensed audio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(sentencePayload)))
    const examples = await searchExamples('爱')
    expect(examples).toHaveLength(2)
    expect(examples[0].en).toBe('I love you.')
    expect(examples[0].audioUrl).toBe('https://api.tatoeba.org/v1/audios/7/file')
    expect(examples[1].en).toBeUndefined()
  })

  it('returns empty list when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(searchExamples('爱')).resolves.toEqual([])
  })

  it('findWordAudio returns null for unlicensed recordings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            { id: 9, license: '', download_url: 'https://api.tatoeba.org/v1/audio/9/file', sentence: { id: 1, text: '爱' } },
          ],
        }),
      ),
    )
    await expect(findWordAudio('爱')).resolves.toBeNull()
  })

  it('findWordAudio returns URL for licensed exact match (punctuation tolerated)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            { id: 9, license: 'CC BY 2.0 FR', download_url: '/v1/audio/9/file', sentence: { id: 1, text: '爱。' } },
          ],
        }),
      ),
    )
    await expect(findWordAudio('爱')).resolves.toBe('https://api.tatoeba.org/v1/audio/9/file')
  })
})
