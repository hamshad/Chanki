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

  return (
    <div className="flex items-center text-xs ml-4">
      {status === 'syncing' && (
        <span className="text-blue-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          Syncing...
        </span>
      )}
      {status === 'idle' && lastSync && (
        <span className="text-gray-500" title={`Last synced: ${lastSync.toLocaleTimeString()}`}>
          Synced
        </span>
      )}
      {status === 'error' && (
        <span className="text-red-400">
          Sync Error
        </span>
      )}
    </div>
  )
}
