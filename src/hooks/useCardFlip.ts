import { useState, useCallback } from 'react'

export type CardSideType = 'hanzi' | 'pinyin' | 'meaning' | 'tone'

export interface CardFlipState {
  promptSide: CardSideType
  visibleSides: Set<CardSideType>
  isFullyRevealed: boolean
  revealOrder: CardSideType[]
}

const ALL_SIDES: CardSideType[] = ['hanzi', 'pinyin', 'meaning', 'tone']

// Deterministic reveal order based on what the prompt is.
// E.g. if prompt is Hanzi, next is Pinyin, then Meaning, then Tone.
const REVEAL_SEQUENCES: Record<CardSideType, CardSideType[]> = {
  hanzi: ['pinyin', 'meaning', 'tone'],
  pinyin: ['hanzi', 'meaning', 'tone'],
  meaning: ['hanzi', 'pinyin', 'tone'],
  tone: ['pinyin', 'hanzi', 'meaning'], // Tone prompts start with Pinyin to identify sound
}

/**
 * Manages the 4-sided state machine for a single review card.
 */
export function useCardFlip() {
  const [state, setState] = useState<CardFlipState>(() => initializeFlipState())

  // Reset for a new card
  const resetFlip = useCallback(() => {
    setState(initializeFlipState())
  }, [])

  // Reveal the next hidden side
  const revealNext = useCallback(() => {
    setState((prev) => {
      if (prev.isFullyRevealed) return prev

      const nextSide = prev.revealOrder.find(side => !prev.visibleSides.has(side))
      
      if (!nextSide) return prev

      const newVisible = new Set(prev.visibleSides)
      newVisible.add(nextSide)

      return {
        ...prev,
        visibleSides: newVisible,
        isFullyRevealed: newVisible.size === 4
      }
    })
  }, [])

  return {
    ...state,
    revealNext,
    resetFlip
  }
}

function initializeFlipState(): CardFlipState {
  const promptSide = ALL_SIDES[Math.floor(Math.random() * ALL_SIDES.length)]
  const sequence = REVEAL_SEQUENCES[promptSide]
  
  return {
    promptSide,
    visibleSides: new Set([promptSide]),
    isFullyRevealed: false,
    revealOrder: sequence
  }
}
