import { s } from './dom.js'

const W = 320, H = 96, PAD_T = 6, PAD_B = 6, PAD_X = 5

const periodEnd = (p) => (p <= 4 ? p * 720 : 2880 + (p - 4) * 300)

// Home win chance across the game. White line, 50% dashed midline, orange dot at the latest point.
// Returns { svg, update(plays, lastPeriod) } so a live game can redraw without re-layout.
export function wpChart() {
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Win chance across the game' })
  const grid = s('g', { stroke: 'var(--hair)', 'stroke-width': 1 })
  const mid = s('line', { x1: 0, y1: H / 2, x2: W, y2: H / 2, stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': '2 5' })
  const line = s('path', { d: '', fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })
  const dot = s('circle', { r: 3.5, fill: 'var(--orange)', cx: -10, cy: -10 })
  svg.append(grid, mid, line, dot)

  let drawnPeriods = 0

  function update(plays, totalPeriods) {
    if (!plays.length) return
    const periods = Math.max(4, totalPeriods || plays[plays.length - 1].period)
    const total = periodEnd(periods)
    const x = (t) => PAD_X + (t / total) * (W - 2 * PAD_X)
    const y = (wp) => PAD_T + (1 - wp) * (H - PAD_T - PAD_B)

    if (drawnPeriods !== periods) {
      while (grid.firstChild) grid.removeChild(grid.firstChild)
      for (let p = 1; p < periods; p++) {
        const px = x(periodEnd(p))
        grid.append(s('line', { x1: px, y1: 0, x2: px, y2: H }))
      }
      drawnPeriods = periods
    }

    // thin the path so a 450-play game draws cheaply
    let d = ''
    let lastX = -1
    for (const p of plays) {
      const px = x(p.t)
      if (px - lastX < 0.6 && p !== plays[plays.length - 1]) continue
      lastX = px
      d += `${d ? 'L' : 'M'}${px.toFixed(1)} ${y(p.wp).toFixed(1)}`
    }
    line.setAttribute('d', d)
    const last = plays[plays.length - 1]
    dot.setAttribute('cx', x(last.t).toFixed(1))
    dot.setAttribute('cy', y(last.wp).toFixed(1))
  }

  return { svg, update }
}
