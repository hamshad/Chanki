import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToneText } from './ToneText'

// Mock CSS imports if needed (we're in happy-dom, so it renders ok)
describe('ToneText', () => {
  it('renders text and applies correct tone color style', () => {
    render(<ToneText text="nǐ" tone="3" />)
    const span = screen.getByText('nǐ')
    
    expect(span.getAttribute('style')).toContain('color: var(--tone-3)')
    expect(span.getAttribute('data-tone')).toBe('3')
  })

  it('applies hanzi-text class when isHanzi is true', () => {
    render(<ToneText text="你" tone="3" isHanzi />)
    const span = screen.getByText('你')
    
    expect(span.className).toContain('hanzi-text')
  })

  it('does not apply hanzi-text class when isHanzi is false', () => {
    render(<ToneText text="nǐ" tone="3" />)
    const span = screen.getByText('nǐ')
    
    expect(span.className).not.toContain('hanzi-text')
  })
})
