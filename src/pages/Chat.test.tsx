import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Chat } from './Chat'
import { loadThread, saveThread, clearThread } from '../data/chatThread'
import { askChat, chatKey, fetchQuota } from '../data/api/chat'
import { recognizeGoogleIme } from '../data/api/googleIme'

vi.mock('../data/chatThread', () => ({
  loadThread: vi.fn(),
  saveThread: vi.fn(),
  clearThread: vi.fn(),
}))

vi.mock('../data/api/chat', async (importOriginal) => {
  // mergeQuota is pure — keep the real one, mock only the network edge.
  const actual = await importOriginal()
  return {
    ...(actual as object),
    askChat: vi.fn(),
    chatKey: vi.fn(() => 'test-key'),
    fetchQuota: vi.fn(),
  }
})

vi.mock('../data/firebase', () => ({
  // Chat model chain comes from Remote Config; tests use the bundled default.
  getChatModels: vi.fn(async (fallback: string[]) => fallback),
}))

vi.mock('../data/api/googleIme', () => ({
  recognizeGoogleIme: vi.fn(),
}))

vi.mock('../data/api/handwriting', () => ({
  loadHandwriting: vi.fn().mockResolvedValue(null),
  recognizeHandwriting: vi.fn(() => []),
}))

const loadThreadMock = vi.mocked(loadThread)
const saveThreadMock = vi.mocked(saveThread)
const clearThreadMock = vi.mocked(clearThread)
const askChatMock = vi.mocked(askChat)
const chatKeyMock = vi.mocked(chatKey)
const fetchQuotaMock = vi.mocked(fetchQuota)
const recognizeGoogleImeMock = vi.mocked(recognizeGoogleIme)

function drawStroke() {
  const canvas = screen.getByRole('img', { name: 'Character drawing area' })
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 20, clientY: 30 })
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 120, clientY: 60 })
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 120, clientY: 60 })
}

beforeEach(() => {
  localStorage.clear()
  loadThreadMock.mockResolvedValue([])
  saveThreadMock.mockResolvedValue(undefined)
  fetchQuotaMock.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function typeAndSend(text: string) {
  fireEvent.change(screen.getByLabelText('Message the assistant'), {
    target: { value: text },
  })
  fireEvent.click(screen.getByLabelText('Send message'))
}

describe('Chat screen', () => {
  it('loads the saved thread and shows the empty state when blank', async () => {
    render(<Chat />)

    expect(await screen.findByText(/no small talk/i)).toBeTruthy()
    expect(loadThreadMock).toHaveBeenCalled()
    expect(screen.getByLabelText('Clear the conversation')).toHaveProperty('disabled', true)
  })

  it('sends the message, then renders the assistant reply', async () => {
    askChatMock.mockResolvedValue('nǐ hǎo = hello')
    render(<Chat />)
    await screen.findByText(/no small talk/i)

    typeAndSend('你好?')

    expect(await screen.findByText('你好?')).toBeTruthy()
    expect(askChatMock).toHaveBeenCalledWith([{ role: 'user', text: '你好?' }], { lang: 'en' })
    expect(await screen.findByText('nǐ hǎo = hello')).toBeTruthy()
    expect(saveThreadMock).toHaveBeenCalledWith([
      { role: 'user', text: '你好?' },
      { role: 'assistant', text: 'nǐ hǎo = hello' },
    ])
  })

  it('renders replies in the lesson typography', async () => {
    loadThreadMock.mockResolvedValueOnce([
      { role: 'user', text: 'what is this?' },
      {
        role: 'assistant',
        text:
          'In Mandarin Chinese, "I am eating" is:\n\n```chinese\n我在吃饭。\nWǒ zài chīfàn.\nI am eating.\n```\n\n### Word by word:\n\n- 我 (wǒ) = I\n- 吃饭 (chīfàn) = to eat',
      },
    ])
    const { container } = render(<Chat />)
    await screen.findByText(/to eat/)

    expect(container.querySelector('.chat-hanzi__hanzi')?.textContent).toBe('我在吃饭。')
    expect(container.querySelector('.chat-hanzi__pinyin')?.textContent).toContain('Wǒ zài chīfàn.')
    expect(container.querySelector('.chat-md__heading')?.textContent).toBe('Word by word:')
    expect(
      [...container.querySelectorAll('.chat-gloss__hanzi')].map((n) => n.textContent),
    ).toEqual(['我', '吃饭'])
  })

  it('shows a pending status while the reply is in flight', async () => {
    let resolve!: (v: string) => void
    askChatMock.mockImplementationOnce(
      () => new Promise<string>((r) => { resolve = r }),
    )
    render(<Chat />)
    await screen.findByText(/no small talk/i)

    typeAndSend('hi')

    expect(await screen.findByRole('status')).toBeTruthy()
    // The Life board loads quietly at message scale.
    expect(screen.getByRole('img', { name: 'Waiting for reply' })).toBeTruthy()
    resolve('yo')
    expect(await screen.findByText('yo')).toBeTruthy()
  })

  it('sends on Enter, shows API errors without dropping the question', async () => {
    askChatMock.mockRejectedValueOnce(new Error('assistant request failed (429)'))
    render(<Chat />)
    const box = await screen.findByLabelText('Message the assistant')

    fireEvent.change(box, { target: { value: 'test' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    expect((await screen.findByRole('alert')).textContent).toContain(
      'assistant request failed (429)',
    )
    // The question stays visible so the user can retry it.
    expect(screen.getByText('test')).toBeTruthy()
  })

  it('clears the conversation on demand', async () => {
    loadThreadMock.mockResolvedValueOnce([{ role: 'user', text: 'kept' }])
    render(<Chat />)
    expect(await screen.findByText('kept')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Clear the conversation'))

    expect(clearThreadMock).toHaveBeenCalled()
    expect(screen.queryByText('kept')).toBeNull()
  })

  it('deletes a single exchange without touching the rest', async () => {
    loadThreadMock.mockResolvedValueOnce([
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
      { role: 'user', text: 'q2' },
      { role: 'assistant', text: 'a2' },
    ])
    render(<Chat />)
    expect(await screen.findByText('a1')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete this exchange' })[0])

    expect(screen.queryByText('q1')).toBeNull()
    expect(screen.queryByText('a1')).toBeNull()
    expect(screen.getByText('q2')).toBeTruthy()
    expect(screen.getByText('a2')).toBeTruthy()
    expect(saveThreadMock).toHaveBeenCalledWith([
      { role: 'user', text: 'q2' },
      { role: 'assistant', text: 'a2' },
    ])
  })

  it('locks the composer and shows a setup hint when the key is missing', async () => {
    chatKeyMock.mockReturnValueOnce('')
    render(<Chat />)

    expect(await screen.findByText(/assistant key missing/i)).toBeTruthy()
    expect(screen.getByLabelText('Message the assistant')).toHaveProperty('disabled', true)
  })

  it('shows the free quota subtly under the title when known', async () => {
    fetchQuotaMock.mockResolvedValue({ used: 8, limit: 50, remaining: 42 })
    render(<Chat />)

    expect(await screen.findByText('42 of 50 free left today')).toBeTruthy()
  })

  it('shows the exhausted state instead of a count at zero', async () => {
    fetchQuotaMock.mockResolvedValue({ used: 50, limit: 50, remaining: 0 })
    render(<Chat />)

    expect(await screen.findByText(/daily free limit reached/i)).toBeTruthy()
  })

  it('locks sending when the free quota is spent', async () => {
    fetchQuotaMock.mockResolvedValue({ used: 50, limit: 50, remaining: 0 })
    render(<Chat />)
    await screen.findByText(/daily free limit reached/i)

    const box = screen.getByLabelText('Message the assistant')
    expect(box.getAttribute('placeholder')).toMatch(/midnight UTC/)
    expect(screen.getByLabelText('Send message')).toHaveProperty('disabled', true)

    // The Enter path is guarded too — no request fires.
    fireEvent.change(box, { target: { value: 'hi' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(askChatMock).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('counts the send instantly even while the server counter lags', async () => {
    // Server keeps reporting the pre-send count — the line must still move.
    fetchQuotaMock.mockResolvedValue({ used: 8, limit: 50, remaining: 42 })
    askChatMock.mockResolvedValue('ok')
    render(<Chat />)
    expect(await screen.findByText('42 of 50 free left today')).toBeTruthy()

    typeAndSend('hi')

    expect(await screen.findByText('ok')).toBeTruthy()
    expect(await screen.findByText('41 of 50 free left today')).toBeTruthy()
  })

  it('defaults to English, switches to Roman Hindi and persists it', async () => {
    askChatMock.mockResolvedValue('ok')
    render(<Chat />)
    await screen.findByText(/no small talk/i)

    const english = screen.getByRole('button', { name: 'English' })
    const roman = screen.getByRole('button', { name: 'Roman Hindi' })
    expect(english.getAttribute('aria-pressed')).toBe('true')
    expect(roman.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(roman)

    expect(roman.getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem('chanki.chat.lang')).toBe('hi-Latn')

    typeAndSend('hi')
    expect(await screen.findByText('ok')).toBeTruthy()
    expect(askChatMock).toHaveBeenCalledWith([{ role: 'user', text: 'hi' }], { lang: 'hi-Latn' })
  })

  it('restores the saved language on mount', async () => {
    localStorage.setItem('chanki.chat.lang', 'hi-Latn')
    render(<Chat />)
    await screen.findByText(/no small talk/i)

    expect(screen.getByRole('button', { name: 'Roman Hindi' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('switching language mid-thread keeps the full context', async () => {
    loadThreadMock.mockResolvedValueOnce([
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1 in english' },
    ])
    askChatMock.mockResolvedValue('a2')
    render(<Chat />)
    await screen.findByText('a1 in english')

    // Switch to Roman Hindi, then continue the same thread.
    fireEvent.click(screen.getByRole('button', { name: 'Roman Hindi' }))
    typeAndSend('q2')

    expect(await screen.findByText('a2')).toBeTruthy()
    // Old turns ride along — context persists across the switch.
    expect(askChatMock).toHaveBeenCalledWith(
      [
        { role: 'user', text: 'q1' },
        { role: 'assistant', text: 'a1 in english' },
        { role: 'user', text: 'q2' },
      ],
      { lang: 'hi-Latn' },
    )
  })

  it('toggles the drawing pad open and closed', async () => {
    render(<Chat />)
    await screen.findByText(/no small talk/i)
    const toggle = screen.getByRole('button', { name: 'Draw a character instead of typing' })

    expect(screen.queryByRole('img', { name: 'Character drawing area' })).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByRole('img', { name: 'Character drawing area' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close the drawing pad' }))
    expect(screen.queryByRole('img', { name: 'Character drawing area' })).toBeNull()
  })

  it('inserts a recognized drawn character into the message', async () => {
    recognizeGoogleImeMock.mockResolvedValue(['你', '好'])
    render(<Chat />)
    await screen.findByText(/no small talk/i)

    fireEvent.click(screen.getByRole('button', { name: 'Draw a character instead of typing' }))
    drawStroke()

    expect(recognizeGoogleImeMock).toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Use 你' }))

    expect(screen.getByLabelText('Message the assistant')).toHaveProperty('value', '你')
    // Ink consumed — chips and strokes clear.
    expect(screen.queryByRole('button', { name: 'Use 你' })).toBeNull()
  })

  it('refreshes the quota after each reply, hides it when unknown', async () => {
    askChatMock.mockResolvedValue('ok')
    render(<Chat />)
    await screen.findByText(/no small talk/i)
    expect(fetchQuotaMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/free left today/i)).toBeNull()

    typeAndSend('hi')

    expect(await screen.findByText('ok')).toBeTruthy()
    expect(fetchQuotaMock).toHaveBeenCalledTimes(2)
  })

  it('retries a failed reply without duplicating the question', async () => {
    askChatMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('back')
    render(<Chat />)
    await screen.findByText(/no small talk/i)

    typeAndSend('q')
    expect(await screen.findByRole('alert')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('back')).toBeTruthy()
    expect(askChatMock).toHaveBeenCalledTimes(2)
    expect(askChatMock).toHaveBeenNthCalledWith(
      2,
      [{ role: 'user', text: 'q' }],
      { lang: 'en' },
    )
    expect(screen.getAllByText('q')).toHaveLength(1)
  })

  it('edits an earlier question and resends from there', async () => {
    loadThreadMock.mockResolvedValueOnce([
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
      { role: 'user', text: 'q2' },
      { role: 'assistant', text: 'a2' },
    ])
    askChatMock.mockResolvedValue('a1-new')
    render(<Chat />)
    await screen.findByText('a2')

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit and resend this question' })[0])
    const box = screen.getByLabelText('Message the assistant')
    expect(box).toHaveProperty('value', 'q1')
    fireEvent.change(box, { target: { value: 'q1 fixed' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('a1-new')).toBeTruthy()
    // Everything from q1 onward replaced.
    expect(screen.queryByText('a1')).toBeNull()
    expect(screen.queryByText('q2')).toBeNull()
    expect(screen.queryByText('a2')).toBeNull()
    expect(askChatMock).toHaveBeenCalledWith([{ role: 'user', text: 'q1 fixed' }], { lang: 'en' })
    expect(saveThreadMock).toHaveBeenCalledWith([
      { role: 'user', text: 'q1 fixed' },
      { role: 'assistant', text: 'a1-new' },
    ])
  })

  it('cancels editing without sending', async () => {
    loadThreadMock.mockResolvedValueOnce([{ role: 'user', text: 'q1' }])
    render(<Chat />)
    await screen.findByText('q1')

    fireEvent.click(screen.getByRole('button', { name: 'Edit and resend this question' }))
    expect(screen.getByLabelText('Message the assistant')).toHaveProperty('value', 'q1')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }))

    expect(screen.getByLabelText('Message the assistant')).toHaveProperty('value', '')
    expect(askChatMock).not.toHaveBeenCalled()
  })
})
