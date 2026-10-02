/**
 * Local-day helpers for the "one review day" rule: a day completes when the
 * session queue is exhausted; it stays complete until local midnight.
 */

export function localDayStamp(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function endOfLocalDay(date: Date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0).getTime() - 1
}

export function startOfLocalDay(date: Date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime()
}

/** Local-day stamp of `ms` (for bucketing timestamps by day). */
export function dayStampOf(ms: number): string {
  return localDayStamp(new Date(ms))
}

/** Stamp of `days` calendar days after `stamp` ('' for invalid input). */
export function addDaysStamp(stamp: string, days: number): string {
  const [y, m, d] = stamp.split('-').map(Number)
  if (!y || !m || !d) return ''
  return localDayStamp(new Date(y, m - 1, d + days))
}
