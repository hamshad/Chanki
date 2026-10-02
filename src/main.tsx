import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPwaUpdates } from './pwa/register.ts'

import { assertV1Schema } from './data/migrator'
import { getOrCreateDeviceId } from './data/device-id'
import { initBackgroundSync } from './data/sync'

// Single registration path: Plan 01 inline wiring moved to src/pwa/register.ts.
// UpdateBanner consumes needRefresh via useRegisterSW; OfflineReady listens
// for the pwa:offline-ready event dispatched by this module.
initPwaUpdates()

async function bootstrap() {
  try {
    assertV1Schema()
    
    // Identity: local UUID on first run; fingerprint lookup re-adopts a
    // previous deviceId after reinstall — never prompts the user.
    const deviceId = await getOrCreateDeviceId()
    console.log('[Chanki] Device ID:', deviceId)

    // Initialize sync listeners (Phase 6)
    initBackgroundSync()

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (err) {
    console.error('[Chanki] Failed to bootstrap Data Contract:', err)
    // Basic fallback UI if IndexedDB is blocked or quota exceeded
    document.getElementById('root')!.innerHTML = 
      '<div style="color:red; padding:20px;">Failed to start app. Please check browser storage settings.</div>'
  }
}

bootstrap()
