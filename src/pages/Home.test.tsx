import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Home } from './Home'
import { fetchRemoteCards } from '../data/remoteCards'

vi.mock('../data/remoteCards', () => ({
  fetchRemoteCards: vi.fn().mockResolvedValue([
    { id: 'a', hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', tone: '3' },
  ]),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Home', () => {
  it('explains the four-sided pitch and shows the retention chart', () => {
    render(<Home />)

    expect(screen.getByRole('heading', { name: /anki asks two sides/i })).toBeTruthy()
    for (const side of ['Character', 'Pinyin', 'Meaning', 'Tone']) {
      expect(screen.getByText(side)).toBeTruthy()
    }
    expect(screen.getByRole('img', { name: /30 days/i })).toBeTruthy()
  })

  it('keeps the privacy note hidden until the button is pressed', () => {
    render(<Home />)

    expect(screen.queryByText(/chankiselang@gmail.com/)).toBeNull()

    const toggle = screen.getByRole('button', { name: /privacy/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)

    expect(screen.getByText(/chankiselang@gmail.com/)).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    // Indie project + device-fingerprint storage + the data-loss caveat.
    expect(screen.getByText(/independent project/i)).toBeTruthy()
    expect(screen.getByText(/fingerprint/i)).toBeTruthy()
    expect(screen.getByText(/may be lost/i)).toBeTruthy()
    expect(fetchRemoteCards).toHaveBeenCalled()
  })
})
