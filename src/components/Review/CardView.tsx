import { useState, useEffect } from 'react'
import { CardSide } from './CardSide'
import { ToneText } from '../ui/ToneText'
import { GradingButtons } from './GradingButtons'
import { WritingPad } from './WritingPad'
import { useCardFlip } from '../../hooks/useCardFlip'
import { playAudio } from '../../utils/audio'
import { Volume2 } from 'lucide-react'
import { scheduler, type SchedulerPreview } from '../../scheduler'
import { getProgress, saveReview } from '../../data/review'
import { getOrCreateDeviceId } from '../../data/device-id'
import type { Card } from '../../data/schema'
import type { Tone, Rating, Progress } from '../../types'

interface CardViewProps {
  card: Card
  onNext: (rating: Rating) => void
}

export function CardView({ card, onNext }: CardViewProps) {
  const { visibleSides, isFullyRevealed, revealNext } = useCardFlip()
  const [preview, setPreview] = useState<SchedulerPreview | null>(null)
  const [deviceId, setDeviceId] = useState<string>('')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [isWriting, setIsWriting] = useState(false)
  const [hasWritten, setHasWritten] = useState(false)

  useEffect(() => {
    async function loadProgress() {
      const devId = await getOrCreateDeviceId()
      setDeviceId(devId)
      const existing = await getProgress(card.id, devId)
      setProgress(existing)
      setPreview(scheduler.preview(card.id, existing))
    }
    loadProgress()
    setIsWriting(false)
    setHasWritten(false)
  }, [card.id])

  const handleTap = () => {
    if (isWriting) return // Don't flip while writing
    if (!isFullyRevealed) {
      revealNext()
    }
  }

  const handleGrade = async (rating: Rating) => {
    if (!deviceId || !preview) return
    const result = scheduler.apply(card.id, deviceId, progress, rating)
    await saveReview(result.progress, result.reviewLog)
    onNext(rating)
  }

  const handleWriteComplete = () => {
    setHasWritten(true)
    setIsWriting(false)
  }

  const handlePlayAudio = (e: React.MouseEvent) => {
    e.stopPropagation()
    playAudio(card.audioUrl, card.hanzi)
  }

  // Helper to safely cast tone string to Tone enum type since Card.tone is a string union
  const tone = card.tone as Tone

  return (
    <div className="card-container flex flex-col items-center w-full">
      <div 
        className="glass-panel flashcard"
        onClick={handleTap}
        role="button"
        tabIndex={0}
      >
        <CardSide isVisible={visibleSides.has('hanzi')} label="Character">
          {isWriting ? (
            <WritingPad 
              text={card.hanzi} 
              tone={tone} 
              onComplete={handleWriteComplete}
            />
          ) : (
            <div className="flex flex-col items-center">
              <ToneText 
                text={card.hanzi} 
                tone={tone} 
                isHanzi 
                className="text-7xl font-bold" 
              />
              {!hasWritten && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsWriting(true); }} 
                  className="text-sm text-blue-400 mt-2 hover:text-blue-300"
                >
                  Practice Writing
                </button>
              )}
              {hasWritten && (
                <span className="text-sm text-green-400 mt-2">✓ Written</span>
              )}
            </div>
          )}
        </CardSide>

        <CardSide isVisible={visibleSides.has('pinyin')} label="Pinyin">
          <ToneText 
            text={card.pinyin} 
            tone={tone} 
            className="text-4xl font-medium tracking-wide" 
          />
        </CardSide>

        <CardSide isVisible={visibleSides.has('meaning')} label="Meaning">
          <span className="text-2xl text-gray-400">
            {card.meaning}
          </span>
        </CardSide>

        <CardSide isVisible={visibleSides.has('tone')} label="Tone">
          <div className="flex flex-col items-center">
            <ToneText 
              text={`Tone ${tone}`} 
              tone={tone} 
              className="text-xl font-bold" 
            />
            <button 
              onClick={handlePlayAudio}
              className="mt-3 p-3 rounded-full bg-gray-800 text-blue-400 hover:bg-gray-700 hover:text-blue-300 transition-colors"
              aria-label="Play Audio"
            >
              <Volume2 size={24} />
            </button>
          </div>
        </CardSide>
      </div>

      {isFullyRevealed ? (
        preview ? (
          <GradingButtons preview={preview} onGrade={handleGrade} />
        ) : (
          <div className="mt-8 text-gray-400 text-sm animate-pulse">Loading scheduling...</div>
        )
      ) : (
        <div className="mt-8 text-gray-400 text-sm animate-pulse opacity-0 h-10">
          Tap to continue
        </div>
      )}
    </div>
  )
}
