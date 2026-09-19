import { useEffect, useRef, useState } from 'react'

/** Minimal typing for the Chromium-only install prompt event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  )
}

/**
 * Chromium install button. beforeinstallprompt is Chromium-only, so the
 * baseline is rendering nothing: the button appears only after the event
 * fires, and hides permanently on appinstalled or when already installed.
 */
export function InstallButton() {
  const [canInstall, setCanInstall] = useState(false)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setCanInstall(true)
    }
    const onAppInstalled = () => {
      deferredRef.current = null
      setCanInstall(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  if (!canInstall) return null

  const install = async () => {
    const deferred = deferredRef.current
    deferredRef.current = null
    setCanInstall(false)
    if (deferred) {
      try {
        await deferred.prompt()
        await deferred.userChoice
      } catch {
        // Prompt failed or was ignored — stay hidden; the browser
        // re-fires beforeinstallprompt if install stays available.
      }
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        void install()
      }}
      style={{ padding: '8px 16px', fontWeight: 600 }}
    >
      Install
    </button>
  )
}
