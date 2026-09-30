import { useEffect, useRef, useState } from 'react'
import HanziWriter from 'hanzi-writer'
import { loadCharData } from '../../data/api/hanziWriter'
import type { Tone } from '../../types'

interface WritingPadProps {
  text: string
  tone: Tone
  onComplete?: () => void
  size?: number
}

export function WritingPad({ text, tone, onComplete, size = 120 }: WritingPadProps) {
  // Only extract actual hanzi characters
  const chars = text.split('').filter(char => char.match(/[\u4e00-\u9fa5]/))
  const [, setCompletedStrokes] = useState<Set<number>>(new Set())

  const handleCharComplete = (index: number) => {
    setCompletedStrokes(prev => {
      const next = new Set(prev).add(index)
      if (next.size === chars.length && onComplete) {
        onComplete()
      }
      return next
    })
  }

  if (chars.length === 0) return null

  return (
    <div className="writing-pad">
      {chars.map((char, i) => (
        <SinglePad 
          key={`${char}-${i}`} 
          char={char} 
          tone={tone} 
          size={size} 
          onComplete={() => handleCharComplete(i)} 
        />
      ))}
    </div>
  )
}

function SinglePad({ char, tone, size, onComplete }: { char: string, tone: Tone, size: number, onComplete: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const writerRef = useRef<HanziWriter | null>(null)
  const [error, setError] = useState(false)
  // Keep latest callback without re-creating the quiz on every parent render
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!containerRef.current) return
    
    const rootStyle = getComputedStyle(document.documentElement)
    const strokeColor = rootStyle.getPropertyValue(`--tone-${tone}`).trim() || '#ffffff'
    const outlineColor = rootStyle.getPropertyValue('--bg-secondary').trim() || '#333333'
    
    containerRef.current.innerHTML = ''
    setError(false)

    try {
      const writer = HanziWriter.create(containerRef.current, char, {
        width: size,
        height: size,
        padding: 5,
        strokeColor: strokeColor,
        drawingColor: strokeColor,
        outlineColor: outlineColor,
        showOutline: true,
        leniency: 1.5,
        showHintAfterMisses: 2,
        charDataLoader: (charToLoad, onLoad, onError) => {
          loadCharData(charToLoad).then((data) => {
            if (data) onLoad(data)
            else onError(new Error(`No stroke data for ${charToLoad}`))
          })
        }
      })
      
      writerRef.current = writer

      writer.quiz({
        onComplete: () => onCompleteRef.current(),
      })
    } catch (err) {
      console.error('HanziWriter error:', err)
      setError(true)
    }

    return () => {
      if (writerRef.current) {
        writerRef.current.cancelQuiz()
      }
    }
  }, [char, tone, size])

  return (
    <div className="flex flex-col items-center">
      <div
        ref={containerRef}
        className="writing-canvas"
        style={{ width: size, height: size, touchAction: 'none' }}
        onClick={(e) => e.stopPropagation()}
      />
      {error && <span className="text-red-400 text-xs mt-2">Stroke data unavailable</span>}
    </div>
  )
}
