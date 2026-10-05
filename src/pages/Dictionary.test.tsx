import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Dictionary } from './Dictionary'

const dictFixture = {
  '你好': { p: 'nǐ hǎo', m: ['hello', 'hi'], l: 1, f: 12 },
  '你': { p: 'nǐ', m: ['you'], l: 1, f: 30 },
  '一': { p: 'yī', m: ['one'], l: 1, f: 5 },
}

const hwFixture = {
  // One horizontal stroke — what a first stroke usually looks like.
  '一': [[100, 500, 900, 500]],
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('cedict-hsk')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dictFixture) })
      }
      if (url.includes('handwriting.json')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(hwFixture) })
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    }),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Dictionary', () => {
  it('searches by pinyin and shows the entry', async () => {
    render(<Dictionary />)
    fireEvent.change(screen.getByLabelText('Search the dictionary'), {
      target: { value: 'nihao' },
    })
    expect(await screen.findByText('hello; hi')).toBeTruthy()
    expect(screen.getByText('nǐ hǎo')).toBeTruthy()
  })

  it('searches by meaning', async () => {
    render(<Dictionary />)
    fireEvent.change(screen.getByLabelText('Search the dictionary'), {
      target: { value: 'hello' },
    })
    expect(await screen.findByText('你好')).toBeTruthy()
  })

  it('expands full senses on row tap', async () => {
    render(<Dictionary />)
    fireEvent.change(screen.getByLabelText('Search the dictionary'), {
      target: { value: 'nihao' },
    })
    const row = await screen.findByRole('button', { expanded: false })
    fireEvent.click(row)
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy()
    expect(screen.getByText('hi')).toBeTruthy()
  })

  it('keeps search history in localStorage only, device-local', async () => {
    render(<Dictionary />)
    fireEvent.change(screen.getByLabelText('Search the dictionary'), {
      target: { value: 'hello' },
    })
    // Past the debounce, the settled query lands in localStorage — nowhere else.
    await new Promise((r) => setTimeout(r, 1100))
    expect(localStorage.getItem('chanki.dict.history')).toContain('hello')

    fireEvent.change(screen.getByLabelText('Search the dictionary'), {
      target: { value: '' },
    })
    const chip = await screen.findByRole('button', { name: 'hello' })
    fireEvent.click(chip)
    expect(
      (screen.getByLabelText('Search the dictionary') as HTMLInputElement).value,
    ).toBe('hello')

    fireEvent.change(screen.getByLabelText('Search the dictionary'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search history' }))
    expect(localStorage.getItem('chanki.dict.history')).toBeNull()
    expect(screen.queryByRole('button', { name: 'hello' })).toBeNull()
  })

  it('draw mode removes the text input — that is what kills the keyboard', async () => {
    render(<Dictionary />)
    expect(screen.getByLabelText('Search the dictionary')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Draw the character instead' }))
    expect(screen.queryByLabelText('Search the dictionary')).toBeNull()
    expect(screen.getByRole('img', { name: 'Character drawing area' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Type to search instead' }))
    expect(screen.getByLabelText('Search the dictionary')).toBeTruthy()
  })

  it('suggests while drawing and commits a tap to the query', async () => {
    render(<Dictionary />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw the character instead' }))
    const canvas = screen.getByRole('img', { name: 'Character drawing area' })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 60 })

    // Recognition loaded + one-stroke drawing → "一" suggested.
    const chip = await screen.findByRole('button', { name: /use/i })
    expect(chip.textContent).toContain('一')

    fireEvent.click(chip)
    // Committed to the query: the row below now shows the dictionary hit…
    expect(await screen.findByText('one')).toBeTruthy()
    // …and the pad reset for the next character.
    expect(screen.getByText(/0 strokes/)).toBeTruthy()
  })
})
