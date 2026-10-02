import './App.css'
import { IosInstallHint } from './components/IosInstallHint.tsx'
import { OfflineReady } from './components/OfflineReady.tsx'
import { OfflineStatus } from './components/OfflineStatus.tsx'
import { UpdateBanner } from './components/UpdateBanner.tsx'
import { SyncStatusBadge } from './components/SyncStatusBadge.tsx'

import { Link, Route, Switch, useLocation } from 'wouter'
import { Home } from './pages/Home'
import { ReviewSession } from './pages/ReviewSession'
import { AdminDashboard } from './pages/AdminDashboard'
import { ToneTrainer } from './pages/ToneTrainer'
import { Resources } from './pages/Resources'
import { Stats } from './pages/Stats'
import { Legal } from './pages/Legal'
import { getAdminCode } from './data/firebase'

import { useState, useRef, useEffect } from 'react'

const NAV_ITEMS = [
  { href: '/review', label: 'Review' },
  { href: '/stats', label: 'Stats' },
  { href: '/tone', label: 'Tone trainer' },
  { href: '/resources', label: 'Resources' },
  { href: '/home', label: 'Home' },
]

const PrivacyPage = () => <Legal kind="privacy" />
const TermsPage = () => <Legal kind="terms" />

/** App opens on review — Home lives at /home, one nav item away. */
function RedirectToReview() {
  const [, setLocation] = useLocation()
  useEffect(() => {
    setLocation('/review')
  }, [setLocation])
  return (
    <p className="faint" aria-live="polite">
      Opening review…
    </p>
  )
}

function NotFound() {
  const [, setLocation] = useLocation()

  return (
    <div className="not-found">
      <span className="not-found__code" aria-hidden="true">
        404
      </span>
      <h1 className="display text-3xl">This page does not exist</h1>
      <p className="muted">The link may be out of date, or the page moved.</p>
      <button className="primary mt-4" onClick={() => setLocation('/home')}>
        Back to home
      </button>
    </div>
  )
}

function App() {
  const [clickCount, setClickCount] = useState(0)
  const lastClickTime = useRef(0)
  const [location, setLocation] = useLocation()

  const handleTitleClick = async () => {
    const now = Date.now()
    if (now - lastClickTime.current > 1000) {
      setClickCount(1)
    } else {
      const newCount = clickCount + 1
      setClickCount(newCount)
      if (newCount >= 7) {
        const code = window.prompt('Admin Code:')
        // Gate value: Firebase Remote Config admin_code (dev fallback 5173).
        if (code && code === (await getAdminCode())) {
          sessionStorage.setItem('admin', 'true')
          setLocation('/admin')
        } else if (code !== null) {
          window.alert('Wrong admin code.')
        }
        setClickCount(0)
      }
    }
    lastClickTime.current = now
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <IosInstallHint />

      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__brand">
            <h1 className="brand">
              <button type="button" onClick={handleTitleClick} aria-label="Chanki">
                Chanki
              </button>
            </h1>
            <SyncStatusBadge />
          </div>

          <div className="header-status">
            <nav className="site-nav" aria-label="Main">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-link"
                  aria-current={location === item.href ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <OfflineStatus />
          </div>
        </div>
      </header>

      <main id="main" className={`app-main${location === '/review' ? ' app-main--focus' : ''}`}>
        <Switch>
          <Route path="/" component={RedirectToReview} />
          <Route path="/home" component={Home} />
          <Route path="/review" component={ReviewSession} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/tone" component={ToneTrainer} />
          <Route path="/stats" component={Stats} />
          <Route path="/resources" component={Resources} />
          <Route path="/privacy" component={PrivacyPage} />
          <Route path="/terms" component={TermsPage} />
          <Route component={NotFound} />
        </Switch>
      </main>

      {/* Review session owns the whole viewport — legal links live on other pages */}
      <footer className={location === '/review' ? 'app-footer app-footer--focus' : 'app-footer'}>
        <div className="app-footer__inner">
          <p>
            Chanki keeps your cards and progress on this device. Nothing is uploaded unless you
            install the app and enable sync.
          </p>
          <nav aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>

      <IosInstallHint />

      <div className="toast-stack">
        <UpdateBanner />
        <OfflineReady />
      </div>
    </>
  )
}

export default App
