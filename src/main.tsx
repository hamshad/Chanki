import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initPwaUpdates } from './pwa/register.ts'

// Single registration path: Plan 01 inline wiring moved to src/pwa/register.ts.
// UpdateBanner consumes needRefresh via useRegisterSW; OfflineReady listens
// for the pwa:offline-ready event dispatched by this module.
initPwaUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
