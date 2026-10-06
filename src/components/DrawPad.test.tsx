import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { DrawPad } from './DrawPad'
import type { Stroke } from '../data/api/handwriting'

interface HarnessProps {
  onFade: () => void
  fadeAfterMs: number | null
  fadePaused?: boolean
}

/** Mirrors Dictionary: the parent owns the ink and clears it on fade. */
function Harness({ onFade, fadeAfterMs, fadePaused }: HarnessProps) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  return (
    <DrawPad
      strokes={strokes}
      onChange={(next) => setStrokes(next)}
      onFade={() => {
        onFade()
        setStrokes([])
      }}
      fadeAfterMs={fadeAfterMs}
      fadePaused={fadePaused}
    />
  )
}

function drawStroke(canvas: HTMLElement, pointerId = 1) {
  fireEvent.pointerDown(canvas, { pointerId, clientX: 20, clientY: 30 })
  fireEvent.pointerMove(canvas, { pointerId, clientX: 120, clientY: 60 })
  fireEvent.pointerUp(canvas, { pointerId, clientX: 120, clientY: 60 })
}

const canvas = () => screen.getByRole('img', { name: 'Character drawing area' })

describe('DrawPad auto-fade', () => {
  it('fades idle ink and reports once the fade finishes', async () => {
    const onFade = vi.fn()
    render(<Harness onFade={onFade} fadeAfterMs={150} />)
    drawStroke(canvas())
    expect(screen.getByText('1 stroke')).toBeTruthy()

    // 150ms idle + the 600ms fade animation.
    await waitFor(() => expect(onFade).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(screen.getByText('0 strokes')).toBeTruthy()
  })

  it('holds the fade while recognition is in flight, then fades', async () => {
    const onFade = vi.fn()
    const { rerender } = render(
      <Harness onFade={onFade} fadeAfterMs={100} fadePaused />,
    )
    drawStroke(canvas())

    // Well past idle + fade — the pause must keep the ink on screen.
    await new Promise((r) => setTimeout(r, 900))
    expect(onFade).not.toHaveBeenCalled()
    expect(screen.getByText('1 stroke')).toBeTruthy()

    rerender(<Harness onFade={onFade} fadeAfterMs={100} fadePaused={false} />)
    await waitFor(() => expect(onFade).toHaveBeenCalledTimes(1), { timeout: 3000 })
  })

  it('a new stroke during the fade restarts the idle clock', async () => {
    const onFade = vi.fn()
    render(<Harness onFade={onFade} fadeAfterMs={1000} />)
    drawStroke(canvas())

    // 1000ms idle + 600ms fade — land mid-animation…
    await new Promise((r) => setTimeout(r, 1200))
    const second = performance.now()
    drawStroke(canvas())

    await waitFor(() => expect(onFade).toHaveBeenCalled(), { timeout: 4000 })
    // …and the touch must cancel it: the reported fade belongs to the new
    // full idle + fade window, not the aborted one.
    expect(performance.now() - second).toBeGreaterThan(1400)
  })

  it('clean slate and backspace buttons report to the parent', () => {
    const onCleanSlate = vi.fn()
    const onBackspace = vi.fn()
    render(
      <DrawPad
        strokes={[
          [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        ]}
        onChange={() => {}}
        onCleanSlate={onCleanSlate}
        onBackspace={onBackspace}
        canBackspace
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clean slate — clear the pad' }))
    expect(onCleanSlate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Backspace — delete last character' }))
    expect(onBackspace).toHaveBeenCalledTimes(1)
  })

  it('backspace stays disabled with no search text', () => {
    render(<DrawPad strokes={[]} onChange={() => {}} canBackspace={false} />)
    expect(
      screen.getByRole('button', { name: 'Backspace — delete last character' }),
    ).toHaveProperty('disabled', true)
  })

  it('ignores a second pointer landing mid-stroke', () => {
    const onFade = vi.fn()
    render(<Harness onFade={onFade} fadeAfterMs={null} />)
    const pad = canvas()
    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 20, clientY: 30 })
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 60, clientY: 40 })
    // Palm/second finger — must not graft points onto the live stroke.
    fireEvent.pointerDown(pad, { pointerId: 2, clientX: 200, clientY: 200 })
    fireEvent.pointerMove(pad, { pointerId: 2, clientX: 240, clientY: 220 })
    fireEvent.pointerUp(pad, { pointerId: 2, clientX: 240, clientY: 220 })
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 120, clientY: 60 })
    fireEvent.pointerUp(pad, { pointerId: 1, clientX: 120, clientY: 60 })

    expect(screen.getByText('1 stroke')).toBeTruthy()
    expect(onFade).not.toHaveBeenCalled()
  })
})
