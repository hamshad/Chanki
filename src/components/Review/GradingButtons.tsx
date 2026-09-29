import type { Rating } from '../../types'
import type { SchedulerPreview } from '../../scheduler'

interface GradingButtonsProps {
  preview: SchedulerPreview
  onGrade: (rating: Rating) => void
}

export function GradingButtons({ preview, onGrade }: GradingButtonsProps) {
  const ratings: { rating: Rating; label: string; color: string }[] = [
    { rating: 'again', label: 'Again', color: 'bg-red-900 text-red-100 hover:bg-red-800' },
    { rating: 'hard', label: 'Hard', color: 'bg-orange-900 text-orange-100 hover:bg-orange-800' },
    { rating: 'good', label: 'Good', color: 'bg-blue-900 text-blue-100 hover:bg-blue-800' },
    { rating: 'easy', label: 'Easy', color: 'bg-green-900 text-green-100 hover:bg-green-800' },
  ]

  return (
    <div className="flex gap-2 mt-8 justify-center w-full max-w-md">
      {ratings.map(({ rating, label, color }) => (
        <button
          key={rating}
          onClick={(e) => {
            e.stopPropagation()
            onGrade(rating)
          }}
          className={`flex-1 py-3 px-2 rounded-lg flex flex-col items-center transition-colors ${color}`}
        >
          <span className="font-medium text-sm mb-1">{label}</span>
          <span className="text-xs opacity-75">{preview[rating].label}</span>
        </button>
      ))}
    </div>
  )
}
