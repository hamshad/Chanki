import { useEffect, useRef, useState } from 'react'
import HanziWriter from 'hanzi-writer'
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
    <div className="flex flex-wrap items-center justify-center gap-4">
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
          fetch(`/assets/deck/hanzi-data/${charToLoad}.json`)
            .then(res => {
              if (!res.ok) throw new Error('Not found')
              return res.json()
            })
            .then(onLoad)
            .catch(onError)
        }
      })
      
      writerRef.current = writer

      writer.quiz({
        onComplete
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
  }, [char, tone, size, onComplete])

  return (
    <div className="flex flex-col items-center">
      <div 
        ref={containerRef} 
        className="bg-gray-800 rounded-lg shadow-inner overflow-hidden flex items-center justify-center cursor-crosshair"
        style={{ width: size, height: size, touchAction: 'none' }}
        onClick={(e) => e.stopPropagation()}
      />
      {error && <span className="text-red-400 text-[10px] mt-1">Data missing</span>}
    </div>
  )
}
