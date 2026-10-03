import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/react'
import { CardView } from './CardView'
import type { Card } from '../../data/schema'

const card: Card = {
  id: '10000000-0000-4000-8000-0000000000aa',
  deckId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  hanzi: '你好',
  pinyin: 'nǐ hǎo',
  meaning: 'hello; hi',
  tone: '3',
  tags: ['hsk1'],
  audioUrl: '/assets/deck/audio/你好.mp3',
  examples: [{ zh: '你好吗？', en: 'How are you?', audioUrl: '/assets/deck/audio/ex-abc.mp3' }],
  schemaVersion: 1,
  createdAt: 1726700000000,
  updatedAt: 1726700000000,
}

function stubSpeech() {
  const speak = vi.fn()
  const cancel = vi.fn()
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => [],
    speak,
    cancel,
    onvoiceschanged: null,
  })
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = ''
      voice = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
    },
  )
  return { speak, cancel }
}

describe('CardView — tone-face audio', () => {
  let speech: ReturnType<typeof stubSpeech>

  beforeEach(() => {
    speech = stubSpeech()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('plays from the voice clip without rotating the cube', () => {
    render(<CardView card={card} onNext={() => {}} />)

    // Navigate to the tone side via the map.
    fireEvent.click(screen.getByRole('button', { name: 'Show Tone side' }))
    const toneFace = document.querySelectorAll('.cube-face')[3] as HTMLElement
    expect(toneFace.style.transform).toMatch(/^rotateY\(0deg\)/)

    const clip = screen.getByRole('button', { name: /play audio/i })
    fireEvent.click(clip)

    // Clip entered playing state …
    expect(screen.getByRole('button', { name: /stop audio/i }).getAttribute('aria-pressed')).toBe('true')
    // … and the tap did NOT fall through to the cube (which would rotate to side 0).
    expect(toneFace.style.transform).toMatch(/^rotateY\(0deg\)/)
    // URL clip path — TTS untouched.
    expect(speech.speak).not.toHaveBeenCalled()
  })

  it('falls back to TTS when the card has no clip', () => {
    const bare: Card = { ...card, audioUrl: undefined }
    render(<CardView card={bare} onNext={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show Tone side' }))
    fireEvent.click(screen.getByRole('button', { name: /play audio/i }))
    expect(speech.speak).toHaveBeenCalledTimes(1)
  })
})
