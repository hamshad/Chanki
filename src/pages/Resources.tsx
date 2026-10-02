import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { subscribeResources, type ResourceLink } from '../data/resources'

/** Learning resources — links curated by the admin, stored in Firebase RTDB. */
export function Resources() {
  const [items, setItems] = useState<ResourceLink[] | null>(null)

  useEffect(() => subscribeResources(setItems), [])

  if (items === null) {
    return (
      <div className="state-block" aria-busy="true">
        <h2 className="state-title">Loading resources…</h2>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="state-block">
        <p className="eyebrow">library</p>
        <h2 className="state-title">No resources yet</h2>
        <p>The admin hasn't added any links. Check back soon.</p>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <p className="eyebrow">library</p>
      <h2 className="display text-3xl mb-6">Resources</h2>

      <div className="glass-panel overflow-hidden">
        {items.map(r => (
          <div key={r.id} className="card-row">
            <div className="card-row__main">
              <span className="font-bold">{r.title}</span>
              {r.note && <span className="text-gray-500 text-sm">{r.note}</span>}
            </div>
            <a
              className="btn-quiet"
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
