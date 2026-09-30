import { useEffect, useState } from 'react'

export function OfflineStatus() {
  const [online, setOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  )
  const [showBackOnline, setShowBackOnline] = useState(false)

  useEffect(() => {
    const goOffline = () => {
      setOnline(false)
      setShowBackOnline(false)
    }
    const goOnline = () => {
      setOnline(true)
      setShowBackOnline(true)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  useEffect(() => {
    if (!showBackOnline) return
    const t = setTimeout(() => setShowBackOnline(false), 4000)
    return () => clearTimeout(t)
  }, [showBackOnline])

  if (!online) {
    return (
      <span role="status" aria-live="polite" data-testid="offline-badge" className="chip chip--warn">
        Offline
      </span>
    )
  }
  if (showBackOnline) {
    return (
      <span role="status" aria-live="polite" data-testid="back-online-badge" className="chip chip--live">
        Back online
      </span>
    )
  }
  return null
}
