import { Link, useLocation } from 'wouter'
import { House, Layers, ChartNoAxesColumn, Mic, Library, BookOpen } from 'lucide-react'

const TABS = [
  { href: '/review', label: 'Review', Icon: Layers },
  { href: '/dict', label: 'Dict', Icon: BookOpen },
  { href: '/stats', label: 'Stats', Icon: ChartNoAxesColumn },
  { href: '/tone', label: 'Tone', Icon: Mic },
  { href: '/resources', label: 'Resources', Icon: Library },
  { href: '/home', label: 'Home', Icon: House },
]

/**
 * Fixed bottom tab bar — the mobile shell's navigation. Hidden on desktop
 * (≥720px, header links take over) and during review (the grade buttons own
 * the bottom of the screen; escape via the header brand).
 */
export function TabBar() {
  const [location] = useLocation()

  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map(({ href, label, Icon }) => {
        const active = location === href
        return (
          <Link
            key={href}
            href={href}
            className={`tab${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={(e) => {
              // Re-tapping the current tab scrolls back to top, like native tab bars.
              if (active) {
                e.preventDefault()
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }
            }}
          >
            <Icon size={21} strokeWidth={2.1} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
