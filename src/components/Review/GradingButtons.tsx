import type { Rating } from '../../types'
import type { SchedulerPreview } from '../../scheduler'

interface GradingButtonsProps {
  preview: SchedulerPreview
  onGrade: (rating: Rating) => void
}

export function GradingButtons({ preview, onGrade }: GradingButtonsProps) {
  const ratings: { rating: Rating; label: string }[] = [
    { rating: 'again', label: 'Again' },
    { rating: 'hard', label: 'Hard' },
    { rating: 'good', label: 'Good' },
    { rating: 'easy', label: 'Easy' },
  ]

  return (
    <div className="grade-bar flex gap-2 justify-center w-full max-w-md">
      {ratings.map(({ rating, label }) => (
        <button
          key={rating}
          type="button"
          data-rating={rating}
          aria-label={`${label}, next review ${preview[rating].label}`}
          onClick={(e) => {
            e.stopPropagation()
            onGrade(rating)
          }}
          className="grade"
        >
          <span>{label}</span>
          <span>{preview[rating].label}</span>
        </button>
      ))}
    </div>
  )
}
