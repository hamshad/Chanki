import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/react'
import { AudioClip } from './AudioClip'

function stubSpeech() {
  const speak = vi.fn(() => {
    // Never fires onend — playback stays "in progress" like a long clip.
  })
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

describe('AudioClip', () => {
  let speech: ReturnType<typeof stubSpeech>

  beforeEach(() => {
    speech = stubSpeech()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('starts playback on click and stops on second click', () => {
    render(<AudioClip text="你好" />)
    const play = screen.getByRole('button', { name: /play audio/i })
    fireEvent.click(play)
    expect(speech.speak).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /stop audio/i }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /stop audio/i }))
    expect(speech.cancel).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /play audio/i }).getAttribute('aria-pressed')).toBe('false')
  })

  it('plays a URL clip without touching TTS', () => {
    const playStub = vi.fn(() => Promise.resolve())
    const pauseStub = vi.fn()
    class FakeAudio {
      src: string
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      play = playStub
      pause = pauseStub
      constructor(src: string) {
        this.src = src
      }
    }
    vi.stubGlobal('Audio', FakeAudio)

    render(<AudioClip text="爱" url="/assets/deck/audio/爱.mp3" />)
    fireEvent.click(screen.getByRole('button', { name: /play audio/i }))
    expect(playStub).toHaveBeenCalledTimes(1)
    expect(speech.speak).not.toHaveBeenCalled()
  })

  it('stops speaking when unmounted', () => {
    const { unmount } = render(<AudioClip text="八" />)
    fireEvent.click(screen.getByRole('button', { name: /play audio/i }))
    expect(speech.speak).toHaveBeenCalledTimes(1)
    unmount()
    expect(speech.cancel).toHaveBeenCalled()
  })

  it('keeps pointerdown and click from reaching the parent cube handlers', () => {
    const onParentPointerDown = vi.fn()
    const onParentClick = vi.fn()
    render(
      <div onPointerDown={onParentPointerDown} onClick={onParentClick}>
        <AudioClip text="火" />
      </div>,
    )

    const button = screen.getByRole('button', { name: /play audio/i })
    fireEvent.pointerDown(button)
    fireEvent.click(button)

    expect(onParentPointerDown).not.toHaveBeenCalled()
    expect(onParentClick).not.toHaveBeenCalled()
    expect(speech.speak).toHaveBeenCalledTimes(1)
  })
})
