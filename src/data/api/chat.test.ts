import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  CHAT_MODEL,
  CHAT_SYSTEM_PROMPT,
  MAX_CONTEXT_MESSAGES,
  askChat,
  buildSystemPrompt,
  chatKey,
  fetchQuota,
  mergeQuota,
} from './chat'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function assistantPayload(content: string): unknown {
  return { choices: [{ message: { content } }] }
}

beforeEach(() => {
  vi.stubEnv('OPENROUTER_KEY', 'test-key')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('chat API', () => {
  it('reads the key from env', () => {
    expect(chatKey()).toBe('test-key')
  })

  it('POSTs model + system prompt + mapped history with auth header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(assistantPayload(' 你好 = hello ')))
    vi.stubGlobal('fetch', fetchMock)

    const reply = await askChat([
      { role: 'user', text: '你好?' },
      { role: 'assistant', text: 'hello' },
    ])

    expect(reply).toBe('你好 = hello')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe(CHAT_MODEL)
    expect(body.temperature).toBe(0.3)
    expect(body.messages[0]).toEqual({ role: 'system', content: buildSystemPrompt('en') })
    expect(body.messages[0].content).toMatch(/explain in english/i)
    expect(body.messages.slice(1)).toEqual([
      { role: 'user', content: '你好?' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  it('sends only the newest context window to the model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(assistantPayload('ok')))
    vi.stubGlobal('fetch', fetchMock)

    const history = Array.from({ length: MAX_CONTEXT_MESSAGES + 10 }, (_, i) => ({
      role: 'user' as const,
      text: `q${i}`,
    }))
    await askChat(history)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    // System prompt + last 30 turns.
    expect(body.messages).toHaveLength(1 + MAX_CONTEXT_MESSAGES)
    expect(body.messages[1].content).toBe('q10')
  })

  it('throws a setup error when the key is missing', async () => {
    vi.stubEnv('OPENROUTER_KEY', '')
    await expect(askChat([{ role: 'user', text: 'hi' }])).rejects.toThrow(
      /OPENROUTER_KEY/,
    )
  })

  it('throws the status on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 429)))
    await expect(askChat([{ role: 'user', text: 'hi' }])).rejects.toThrow(/free limit hit \(429\)/)
  })

  it('throws a connection error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(askChat([{ role: 'user', text: 'hi' }])).rejects.toThrow(/unreachable/)
  })

  it('throws on malformed or empty replies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ wrong: true })))
    await expect(askChat([{ role: 'user', text: 'hi' }])).rejects.toThrow(/malformed/)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(assistantPayload('   '))),
    )
    await expect(askChat([{ role: 'user', text: 'hi' }])).rejects.toThrow(/empty/)
  })
})

describe('chat system prompt', () => {
  it('scopes answers to Chinese language and China culture', () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/chinese only/i)
    expect(CHAT_SYSTEM_PROMPT).toMatch(/mandarin chinese/i)
    expect(CHAT_SYSTEM_PROMPT).toMatch(/japanese/i)
    expect(CHAT_SYSTEM_PROMPT).toMatch(/out of scope/)
    expect(CHAT_SYSTEM_PROMPT).toMatch(/no small talk|no filler/i)
  })

  it('forces the hanzi + pinyin + meaning term format', () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/format it exactly as/)
    expect(CHAT_SYSTEM_PROMPT).toMatch(/pīnyīn · meaning/)
    expect(CHAT_SYSTEM_PROMPT).toMatch(/```chinese/)
    expect(CHAT_SYSTEM_PROMPT).toMatch(/one sentence per block/i)
  })

  it('buildSystemPrompt defaults to English, switches to Roman Hindi', () => {
    expect(buildSystemPrompt()).toMatch(/explain in english/i)
    expect(buildSystemPrompt('en')).toMatch(/explain in english/i)
    const roman = buildSystemPrompt('hi-Latn')
    expect(roman).toMatch(/roman hindi/i)
    expect(roman).toMatch(/latin.*script|roman script/i)
    expect(roman).toMatch(/never devanagari/i)
    // Scope + style survive in both.
    expect(roman).toMatch(/chinese only/i)
  })

  it('buildSystemPrompt leads with the language rule', () => {
    const prompt = buildSystemPrompt('hi-Latn')
    expect(prompt.indexOf('Roman Hindi')).toBeLessThan(prompt.indexOf('Chinese only'))
  })

  it('askChat sends the Roman Hindi rule when asked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(assistantPayload('ok')))
    vi.stubGlobal('fetch', fetchMock)

    await askChat(
      [
        { role: 'user', text: 'first' },
        { role: 'assistant', text: 'pehla' },
        { role: 'user', text: 'second' },
      ],
      { lang: 'hi-Latn' },
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.messages[0].content).toMatch(/roman hindi/i)
    const sent = body.messages.slice(1)
    // Earlier turns ship verbatim; only the newest user turn is stamped.
    expect(sent[0]).toEqual({ role: 'user', content: 'first' })
    expect(sent[1]).toEqual({ role: 'assistant', content: 'pehla' })
    expect(sent[2].role).toBe('user')
    expect(sent[2].content).toMatch(/^second\n\n\[Reply ENTIRELY in Roman Hindi/)
    expect(sent[2].content).toMatch(/overrides the language of previous replies/)
  })

  it('askChat leaves English requests untouched', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(assistantPayload('ok')))
    vi.stubGlobal('fetch', fetchMock)

    await askChat([{ role: 'user', text: 'hi' }])

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' })
  })
})

describe('chat quota', () => {
  const keyPayload = {
    data: {
      free_model_daily_requests: { used: 8, limit: 50, remaining: 42 },
    },
  }

  it('maps used/limit/remaining from the key endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(keyPayload))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchQuota()).resolves.toEqual({ used: 8, limit: 50, remaining: 42 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/key')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key')
    // A cached copy looks like a quota that never moves.
    expect(init.cache).toBe('no-store')
  })

  it('returns null without fetching when the key is missing', async () => {
    vi.stubEnv('OPENROUTER_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchQuota()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null on HTTP error, network failure or bad shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)))
    await expect(fetchQuota()).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(fetchQuota()).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: {} })))
    await expect(fetchQuota()).resolves.toBeNull()
  })

  it('mergeQuota adopts server on first load and on a new UTC day', () => {
    const server = { used: 8, limit: 50, remaining: 42 }
    expect(mergeQuota(null, '', server, '2026-10-06')).toEqual({
      quota: server,
      day: '2026-10-06',
    })
    expect(
      mergeQuota({ used: 49, limit: 50, remaining: 1 }, '2026-10-05', server, '2026-10-06'),
    ).toEqual({ quota: server, day: '2026-10-06' })
  })

  it('mergeQuota keeps the optimistic count while the server lags', () => {
    const shown = { used: 9, limit: 50, remaining: 41 }
    const staleServer = { used: 8, limit: 50, remaining: 42 }
    expect(mergeQuota(shown, '2026-10-06', staleServer, '2026-10-06')).toEqual({
      quota: shown,
      day: '2026-10-06',
    })
  })

  it('mergeQuota adopts the server when it knows more (other clients)', () => {
    const shown = { used: 9, limit: 50, remaining: 41 }
    const aheadServer = { used: 12, limit: 50, remaining: 38 }
    expect(mergeQuota(shown, '2026-10-06', aheadServer, '2026-10-06')).toEqual({
      quota: aheadServer,
      day: '2026-10-06',
    })
  })
})
