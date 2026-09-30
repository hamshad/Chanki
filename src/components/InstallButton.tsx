import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

/** Minimal typing for the Chromium-only install prompt event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    /** Populated by the inline head script before the app bundle boots. */
    __chankiInstall: BeforeInstallPromptEvent | null
  }
}

function getDeferred(): BeforeInstallPromptEvent | null {
  return window.__chankiInstall ?? null
}

function setDeferred(event: BeforeInstallPromptEvent | null) {
  window.__chankiInstall = event
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  )
}

function ua(): string {
  return navigator.userAgent
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(ua())
}

/** iPadOS 13+ masquerades as macOS but is touch-first Safari. */
function isIpadOs(): boolean {
  return /macintosh/i.test(ua()) && (navigator.maxTouchPoints ?? 0) > 1
}

function isAndroid(): boolean {
  return /android/i.test(ua())
}

function isChromium(): boolean {
  return !isIos() && /chrome|chromium|crios|edg/i.test(ua())
}

function isFirefox(): boolean {
  return /firefox|fxios/i.test(ua())
}

function isSafari(): boolean {
  return /safari/i.test(ua()) && !isChromium() && !isFirefox() && !isAndroid()
}

function installSteps(): string {
  if (isIos() || isIpadOs()) {
    return 'Tap Share (square with arrow) → Add to Home Screen → Add'
  }
  if (isAndroid()) {
    return 'Tap the ⋮ menu → Add to Home screen → Install'
  }
  if (isFirefox()) {
    return 'Open the ≡ menu → Install Chanki (Install this site as an app)'
  }
  if (isChromium()) {
    return 'Open the ⋮ menu → Cast, save, and share → Install page as app'
  }
  if (isSafari()) {
    return 'Open the Share menu → Add to Home Screen'
  }
  return 'Open your browser menu → Install app / Add to Home screen'
}

/**
 * Install button for the home hero.
 *
 * Always visible when not installed — no platform should end up without an
 * entry point:
 * - Chromium (Chrome/Brave/Edge): click runs the native prompt — a real
 *   one-click install. The event itself is captured by an inline head
 *   script (see index.html) because it can fire before React mounts; the
 *   click waits up to 2.5s if it hasn't arrived yet.
 * - iOS / Firefox / Safari / Android fallback: no programmatic install API
 *   exists, so the click reveals the short manual steps.
 */
export function InstallButton() {
  const [stepsOpen, setStepsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Fallback listener in case the inline head script didn't run
    // (e.g. unit tests, stripped HTML). Writing the same global keeps
    // both paths racing for the same single slot.
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onAppInstalled = () => {
      setDeferred(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  /** Chromium sometimes fires the event a beat after page load. */
  const waitForPrompt = (timeoutMs: number): Promise<BeforeInstallPromptEvent | null> => {
    const existing = getDeferred()
    if (existing) return Promise.resolve(existing)
    if (!isChromium()) return Promise.resolve(null)
    return new Promise((resolve) => {
      const started = Date.now()
      const check = () => {
        const ready = getDeferred()
        if (ready) resolve(ready)
        else if (Date.now() - started > timeoutMs) resolve(null)
        else setTimeout(check, 100)
      }
      check()
    })
  }

  if (installed || isStandalone()) return null

  const install = async () => {
    setBusy(true)
    try {
      const deferred = await waitForPrompt(2500)
      if (deferred) {
        setDeferred(null)
        await deferred.prompt()
        await deferred.userChoice
      } else {
        setStepsOpen((v) => !v)
      }
    } catch {
      // Prompt failed or was ignored — reveal the manual steps instead.
      setStepsOpen(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        id="install-app-button"
        className="secondary"
        disabled={busy}
        aria-expanded={stepsOpen}
        onClick={() => {
          void install()
        }}
      >
        <Download size={16} aria-hidden="true" />
        {busy ? 'Installing…' : 'Install app'}
      </button>
      {stepsOpen && (
        <p className="install-hint" role="note">
          {installSteps()}
        </p>
      )}
    </>
  )
}
