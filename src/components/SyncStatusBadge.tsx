import { useState, useEffect } from 'react'

export function SyncStatusBadge() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [lastSync, setLastSync] = useState<Date | null>(null)

  useEffect(() => {
    const handleStart = () => setStatus('syncing')
    const handleEnd = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail?.success) {
        setStatus('idle')
        setLastSync(new Date())
      } else {
        setStatus('error')
      }
    }

    window.addEventListener('sync:start', handleStart)
    window.addEventListener('sync:end', handleEnd)

    return () => {
      window.removeEventListener('sync:start', handleStart)
      window.removeEventListener('sync:end', handleEnd)
    }
  }, [])

  if (status === 'idle' && !lastSync) return null

  if (status === 'syncing') {
    return (
      <span className="chip chip--live">
        <span className="dot animate-pulse" />
        Syncing
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span className="chip chip--danger" role="status">
        Sync failed
      </span>
    )
  }

  return (
    <span className="chip" title={`Last synced: ${lastSync?.toLocaleTimeString() ?? ''}`}>
      Synced
    </span>
  )
}
