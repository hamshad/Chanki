import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface CardSideProps {
  isVisible: boolean
  label?: string
  children: ReactNode
  className?: string
}

export function CardSide({ isVisible, label, children, className = '' }: CardSideProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`card-side ${className}`}
        >
          {label && (
            <span className="card-side-label">
              {label}
            </span>
          )}
          <div className="card-side-content">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
