import { getToneColorVar } from '../../utils/tones'
import type { Tone } from '../../types'

interface ToneTextProps {
  text: string
  tone: Tone
  className?: string
  isHanzi?: boolean
}

/**
 * Renders text with the color associated with its tone.
 * Optionally applies the `.hanzi-text` class for proper Chinese typography.
 */
export function ToneText({ text, tone, className = '', isHanzi = false }: ToneTextProps) {
  const color = getToneColorVar(tone)
  const combinedClassName = `tone-text ${isHanzi ? 'hanzi-text' : ''} ${className}`.trim()

  return (
    <span
      className={combinedClassName}
      style={{ color }}
      data-tone={tone}
    >
      {text}
    </span>
  )
}
