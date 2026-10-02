import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ToneTrainer } from './ToneTrainer'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ToneTrainer', () => {
  it('renders tone picker, contour graph, and one-tap record control', () => {
    render(<ToneTrainer />)

    expect(screen.getByRole('heading', { name: /tone trainer/i })).toBeTruthy()
    expect(screen.getByTestId('tone-contour')).toBeTruthy()
    expect(screen.getByText(/record attempt/i)).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(6) // 5 tones + record
  })

  it('defaults to tone 3 (the canonical dip-rise syllable)', () => {
    render(<ToneTrainer />)
    expect(screen.getByText(/214 dip-rise/)).toBeTruthy()
  })

  it('switches the target tone', () => {
    render(<ToneTrainer />)
    fireEvent.click(screen.getByRole('button', { name: /tone 4/i }))
    expect(screen.getByText(/51 falling/)).toBeTruthy()
  })

  it('reports an unavailable microphone without crashing the graph', async () => {
    vi.stubGlobal('navigator', { mediaDevices: {} })

    render(<ToneTrainer />)
    fireEvent.click(screen.getByText(/record attempt/i))

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toMatch(/microphone unavailable/i)
    expect(screen.getByTestId('tone-contour')).toBeTruthy()
  })

  it('shows a distinct message when permission is denied', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
      },
    })

    render(<ToneTrainer />)
    fireEvent.click(screen.getByText(/record attempt/i))

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toMatch(/permission denied/i)
  })
})
