interface Unit {
  name: Intl.RelativeTimeFormatUnit
  ms: number
}

const UNITS: Unit[] = [
  { name: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
  { name: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
  { name: 'week', ms: 1000 * 60 * 60 * 24 * 7 },
  { name: 'day', ms: 1000 * 60 * 60 * 24 },
  { name: 'hour', ms: 1000 * 60 * 60 },
  { name: 'minute', ms: 1000 * 60 },
]

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "3 minutes ago", "yesterday", "just now" for an ISO timestamp. */
export const formatRelativeTime = (iso: string, now: Date = new Date()): string => {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = then - now.getTime()
  for (const unit of UNITS) {
    if (Math.abs(diff) >= unit.ms) {
      return formatter.format(Math.round(diff / unit.ms), unit.name)
    }
  }
  return 'just now'
}
