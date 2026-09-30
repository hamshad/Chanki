import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { InfoSheet } from './InfoSheet'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('InfoSheet', () => {
  it('renders content in a modal dialog', () => {
    render(
      <InfoSheet title="Examples" onClose={() => {}}>
        <p>你好。</p>
      </InfoSheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Examples' })
    expect(dialog.textContent).toContain('你好。')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('closes on backdrop click but not on panel click', () => {
    const onClose = vi.fn()
    render(
      <InfoSheet title="Examples" onClose={onClose}>
        <p>x</p>
      </InfoSheet>,
    )
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <InfoSheet title="Examples" onClose={onClose}>
        <p>x</p>
      </InfoSheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes via the ✕ button', () => {
    const onClose = vi.fn()
    render(
      <InfoSheet title="Measure words" onClose={onClose}>
        <p>x</p>
      </InfoSheet>,
    )
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('locks body scroll while open and restores it on unmount', () => {
    const { unmount } = render(
      <InfoSheet title="Examples" onClose={() => {}}>
        <p>x</p>
      </InfoSheet>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })
})
