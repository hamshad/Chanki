import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ToneSpike } from './ToneSpike'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ToneSpike (Phase 10 harness)', () => {
  it('renders calibration, tone picker, and capture controls', () => {
    render(<ToneSpike />)

    expect(screen.getByRole('heading', { name: /tone spike/i })).toBeTruthy()
    expect(screen.getByLabelText(/target tone/i)).toBeTruthy()
    expect(screen.getByText(/calibrate mic/i)).toBeTruthy()
    expect(screen.getByText(/start recording/i)).toBeTruthy()
    expect(screen.queryByTestId('capture-state')).toBeNull()
  })

  it('states the on-device privacy guarantee up front', () => {
    render(<ToneSpike />)
    expect(screen.getByText(/no audio or pitch data is ever uploaded/i)).toBeTruthy()
  })

  it('shows a recoverable error when the microphone is unavailable', async () => {
    vi.stubGlobal('navigator', { mediaDevices: {} })

    render(<ToneSpike />)
    fireEvent.click(screen.getByText(/start recording/i))

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toMatch(/microphone unavailable/i)
    expect(screen.getByText(/start recording/i)).toBeTruthy()
  })

  it('reports a denied permission distinctly from a missing device', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(
          new DOMException('denied', 'NotAllowedError'),
        ),
      },
    })

    render(<ToneSpike />)
    fireEvent.click(screen.getByText(/calibrate mic/i))

    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toMatch(/permission denied/i)
  })
})
