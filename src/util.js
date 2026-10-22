const pad = (n) => String(n).padStart(2, '0')

export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

export const parseDate = (str) => new Date(+str.slice(0, 4), +str.slice(4, 6) - 1, +str.slice(6, 8))

export const shiftDate = (str, days) => {
  const d = parseDate(str)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

export const isValidDate = (str) => /^\d{8}$/.test(str) && !Number.isNaN(parseDate(str).getTime())

// "Tonight" / "Yesterday" / "Tomorrow" / "Wed, Oct 15"
export function dayTitle(str) {
  const today = todayStr()
  if (str === today) return 'Tonight'
  if (str === shiftDate(today, -1)) return 'Last night'
  if (str === shiftDate(today, 1)) return 'Tomorrow'
  const sameYear = str.slice(0, 4) === today.slice(0, 4)
  return parseDate(str).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })
}

export const shortDate = (str) => parseDate(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export const tipTime = (iso) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(' ', ' ')

export const periodLabel = (p) => (p <= 4 ? ['1ST', '2ND', '3RD', '4TH'][p - 1] : p === 5 ? 'OT' : `${p - 4}OT`)
export const periodWord = (p) => (p <= 4 ? ['1st', '2nd', '3rd', '4th'][p - 1] : p === 5 ? 'OT' : `${p - 4}OT`)

const clockSecs = (c) => {
  const [m, s] = String(c || '0:00').split(':').map(Number)
  return (m || 0) * 60 + (s || 0)
}

// Crunch time: 4th quarter or OT, within 5, game in progress.
export function isCrunch(g) {
  if (g.state !== 'in' || g.period < 4) return false
  if (g.home.score == null || g.away.score == null) return false
  return Math.abs(g.home.score - g.away.score) <= 5
}

export const isLastTwo = (g) => g.state === 'in' && g.period >= 4 && clockSecs(g.clock) <= 120
