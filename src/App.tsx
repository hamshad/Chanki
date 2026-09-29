import './App.css'
import { IosInstallHint } from './components/IosInstallHint.tsx'
import { OfflineReady } from './components/OfflineReady.tsx'
import { OfflineStatus } from './components/OfflineStatus.tsx'
import { UpdateBanner } from './components/UpdateBanner.tsx'
import { SyncStatusBadge } from './components/SyncStatusBadge.tsx'

import { Route, Switch, useLocation } from 'wouter'
import { Home } from './pages/Home'
import { ReviewSession } from './pages/ReviewSession'
import { AdminDashboard } from './pages/AdminDashboard'
import { ToneSpike } from './components/ToneSpike'

import { useState, useRef } from 'react'

function App() {
  const [clickCount, setClickCount] = useState(0)
  const lastClickTime = useRef(0)
  const [, setLocation] = useLocation()
  
  const handleTitleClick = () => {
    const now = Date.now()
    if (now - lastClickTime.current > 1000) {
      setClickCount(1)
    } else {
      const newCount = clickCount + 1
      setClickCount(newCount)
      if (newCount >= 7) {
        const code = window.prompt('Admin Code:')
        // Note: In real app use VITE_ADMIN_CODE env var. 
        if (code === (import.meta.env.VITE_ADMIN_CODE || '0000')) {
          sessionStorage.setItem('admin', 'true')
          setLocation('/admin')
        }
        setClickCount(0)
      }
    }
    lastClickTime.current = now
  }

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1 
            className="text-2xl font-bold m-0 cursor-pointer select-none" 
            style={{ margin: 0 }}
            onClick={handleTitleClick}
          >
            Chanki
          </h1>
          <SyncStatusBadge />
        </div>
        <OfflineStatus />
      </header>
      
      <main style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/review" component={ReviewSession} />
          <Route path="/admin" component={AdminDashboard} />
          {/* Phase 10 spike harness — dev-only pitch capture, no audio leaves the device */}
          <Route path="/tone-spike" component={ToneSpike} />
          {/* Default fallback */}
          <Route>
            <div>404 - Page not found</div>
          </Route>
        </Switch>
      </main>
      
      <IosInstallHint />
      <UpdateBanner />
      <OfflineReady />
    </>
  )
}

export default App
