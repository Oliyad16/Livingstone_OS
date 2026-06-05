// Shared chart theme — keeps every Recharts visualization on the same
// gold/berry palette as the rest of the Command Center.

export const CHART = {
  gold: '#9a7723',
  goldSoft: '#c9a961',
  goldLight: '#e3cd97',
  berry: '#2f4bc4',
  berrySoft: '#6f86e0',
  green: '#059669',
  red: '#dc2626',
  amber: '#d97706',
  ink: '#2a2620',
  muted: '#8b8475',
  grid: '#e7e1d6',
  paper: '#ffffff',
}

// Ordered categorical palette for donuts / multi-series.
export const SERIES_COLORS = [
  '#9a7723', // gold
  '#2f4bc4', // berry
  '#059669', // green
  '#c9a961', // soft gold
  '#6f86e0', // soft berry
  '#d97706', // amber
  '#7c5cbf', // violet
  '#0ea5a4', // teal
  '#b45309', // bronze
  '#94a3b8', // slate
]

export const axisProps = {
  stroke: CHART.muted,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

export function money(n: number) {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${n.toLocaleString()}`
}

export function compact(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(Math.round(n))
}
