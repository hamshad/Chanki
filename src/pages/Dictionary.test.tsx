import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Dictionary } from './Dictionary'

const dictFixture = {
  '你好': { p: 'nǐ hǎo', m: ['hello', 'hi'], l: 1, f: 12 },
  '你': { p: 'nǐ', m: ['you'], l: 1, f: 30 },
  '一': { p: 'yī', m: ['one'], l: 1, f: 5 },
}

const hwFixture = {
  // One horizontal stroke — what a first stroke usually looks like.
  '一': { s: [[100, 500, 900, 500]] },
}

/** `ime: 'fail'` simulates offline — the endpoint is unreachable. */
function makeFetch(ime: 'success' | 'fail' = 'success') {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('inputtools')) {
      if (ime === 'success') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(['SUCCESS', [['id1', ['一', '二']]]]),
        })
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    }
    if (url.includes('cedict-hsk')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dictFixture) })
    }
    if (url.includes('handwriting.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(hwFixture) })
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', makeFetch())
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
    // Pinyin renders per syllable in tone colors — same text, split nodes.
    expect(screen.getByText('nǐ')).toBeTruthy()
    expect(screen.getByText('hǎo')).toBeTruthy()
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
    const card = await screen.findByRole('button', { name: 'Search hello' })
    fireEvent.click(card)
    expect(
      (screen.getByLabelText('Search the dictionary') as HTMLInputElement).value,
    ).toBe('hello')

    fireEvent.change(screen.getByLabelText('Search the dictionary'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search history' }))
    expect(localStorage.getItem('chanki.dict.history')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Search hello' })).toBeNull()
  })

  it('recent-search cards show the character, pinyin and meaning', async () => {
    render(<Dictionary />)
    fireEvent.change(screen.getByLabelText('Search the dictionary'), {
      target: { value: 'nihao' },
    })
    // Wait for the debounced history write…
    await new Promise((r) => setTimeout(r, 1100))
    fireEvent.change(screen.getByLabelText('Search the dictionary'), {
      target: { value: '' },
    })

    const card = await screen.findByRole('button', { name: 'Search nihao' })
    expect(card.textContent).toContain('你好')
    expect(card.textContent).toContain('nǐ hǎo')
    expect(card.textContent).toContain('hello; hi')
  })

  it('draw mode keeps the search box visible but unfocused — keyboard stays closed', () => {
    render(<Dictionary />)
    const input = screen.getByLabelText('Search the dictionary')
    expect(document.activeElement).toBe(input)

    fireEvent.click(screen.getByRole('button', { name: 'Draw the character instead' }))
    // The field must stay on screen — recognized text lands there — but
    // blurred, or the mobile keyboard would cover the pad.
    expect(screen.getByLabelText('Search the dictionary')).toBeTruthy()
    expect(document.activeElement).not.toBe(input)
    expect(screen.getByRole('img', { name: 'Character drawing area' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Type to search instead' }))
    expect(document.activeElement).toBe(input)
  })

  it('suggests while drawing and commits a tap to the query', async () => {
    render(<Dictionary />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw the character instead' }))
    const canvas = screen.getByRole('img', { name: 'Character drawing area' })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 60 })

    // Recognition loaded + one-stroke drawing → "一" suggested (top of the
    // engine's candidates).
    const chip = await screen.findByRole('button', { name: 'Use 一' })
    expect(chip.textContent).toContain('一')

    fireEvent.click(chip)
    // Committed to the query: the row below now shows the dictionary hit…
    expect(await screen.findByText('one')).toBeTruthy()
    // …and the pad reset for the next character.
    expect(screen.getByText(/0 strokes/)).toBeTruthy()
  })

  it('lands the recognized text in the search box without a tap', async () => {
    render(<Dictionary />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw the character instead' }))
    const canvas = screen.getByRole('img', { name: 'Character drawing area' })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 60 })

    // Chips render once the engine answered — its top candidate is already
    // in the search box, keyboard-style.
    await screen.findByRole('button', { name: 'Use 一' })
    fireEvent.click(screen.getByRole('button', { name: 'Type to search instead' }))
    expect(
      (screen.getByLabelText('Search the dictionary') as HTMLInputElement).value,
    ).toBe('一')
  })

  it('offline falls back to local matcher chips with no auto-commit', async () => {
    vi.stubGlobal('fetch', makeFetch('fail'))
    render(<Dictionary />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw the character instead' }))
    const canvas = screen.getByRole('img', { name: 'Character drawing area' })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 60 })

    const chip = await screen.findByRole('button', { name: /use/i })
    expect(chip.textContent).toContain('一')
    fireEvent.click(screen.getByRole('button', { name: 'Type to search instead' }))
    expect(
      (screen.getByLabelText('Search the dictionary') as HTMLInputElement).value,
    ).toBe('')
  })

  it('clean slate wipes the pad but keeps the recognized text', async () => {
    render(<Dictionary />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw the character instead' }))
    const canvas = screen.getByRole('img', { name: 'Character drawing area' })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    await screen.findByRole('button', { name: 'Use 一' })

    fireEvent.click(screen.getByRole('button', { name: 'Clean slate — clear the pad' }))
    // Ink and chips drop away, but the text the ink produced stays put.
    expect(screen.getByText(/0 strokes/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use 一' })).toBeNull()
    expect(
      (screen.getByLabelText('Search the dictionary') as HTMLInputElement).value,
    ).toBe('一')
  })

  it('backspace deletes the last character and seals the pending segment', async () => {
    render(<Dictionary />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw the character instead' }))
    const canvas = screen.getByRole('img', { name: 'Character drawing area' })
    const input = screen.getByLabelText('Search the dictionary') as HTMLInputElement

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    await screen.findByRole('button', { name: 'Use 一' })
    expect(input.value).toBe('一')

    fireEvent.click(
      screen.getByRole('button', { name: 'Backspace — delete last character' }),
    )
    expect(input.value).toBe('')
  })

  it('fades the ink away but keeps the recognized text in the box', async () => {
    render(<Dictionary />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw the character instead' }))
    const canvas = screen.getByRole('img', { name: 'Character drawing area' })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 140, clientY: 60 })
    await screen.findByRole('button', { name: 'Use 一' })

    // ~2s idle + the 600ms fade: the ink and its chips drop away, Gboard
    // style, while the recognized text stays committed in the field.
    await waitFor(() => expect(screen.getByText(/0 strokes/)).toBeTruthy(), {
      timeout: 5000,
    })
    expect(screen.queryByRole('button', { name: 'Use 一' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Type to search instead' }))
    expect(
      (screen.getByLabelText('Search the dictionary') as HTMLInputElement).value,
    ).toBe('一')
  })
})
