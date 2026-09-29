import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCardFlip } from './useCardFlip'

describe('useCardFlip', () => {
  beforeEach(() => {
    // Reset Math.random to a predictable value if needed, but here we can just test properties
  })

  it('initializes with a single random prompt side', () => {
    const { result } = renderHook(() => useCardFlip())
    
    expect(result.current.visibleSides.size).toBe(1)
    expect(result.current.isFullyRevealed).toBe(false)
    
    const prompt = result.current.promptSide
    expect(['hanzi', 'pinyin', 'meaning', 'tone']).toContain(prompt)
    expect(result.current.visibleSides.has(prompt)).toBe(true)
  })

  it('reveals sides sequentially and marks as fully revealed', () => {
    const { result } = renderHook(() => useCardFlip())
    
    // Initial state: 1 side visible
    expect(result.current.visibleSides.size).toBe(1)
    
    // Tap 1
    act(() => result.current.revealNext())
    expect(result.current.visibleSides.size).toBe(2)
    expect(result.current.isFullyRevealed).toBe(false)
    
    // Tap 2
    act(() => result.current.revealNext())
    expect(result.current.visibleSides.size).toBe(3)
    expect(result.current.isFullyRevealed).toBe(false)
    
    // Tap 3 (Final)
    act(() => result.current.revealNext())
    expect(result.current.visibleSides.size).toBe(4)
    expect(result.current.isFullyRevealed).toBe(true)
    
    // Tapping again should have no effect
    act(() => result.current.revealNext())
    expect(result.current.visibleSides.size).toBe(4)
    expect(result.current.isFullyRevealed).toBe(true)
  })

  it('resets flip state to a new random prompt', () => {
    // Mock Math.random to always return 0 (hanzi) for first call, then 0.99 (tone) for second call
    const mathRandomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1) // hanzi
      .mockReturnValueOnce(0.9) // tone
      
    const { result } = renderHook(() => useCardFlip())
    
    expect(result.current.promptSide).toBe('hanzi')
    
    act(() => result.current.revealNext())
    expect(result.current.visibleSides.size).toBe(2)
    
    act(() => result.current.resetFlip())
    
    expect(result.current.promptSide).toBe('tone')
    expect(result.current.visibleSides.size).toBe(1)
    expect(result.current.isFullyRevealed).toBe(false)
    
    mathRandomSpy.mockRestore()
  })
})
