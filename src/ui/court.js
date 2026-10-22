import { s } from './dom.js'

// NBA court in feet. Origin at center court, x along the length (−47..47), y across (−25..25).
// Hoops at x = ±41.75. Everything here is drawn from real dimensions so the shot chart reads true.
const HOOP = 41.75
const THREE_R = 23.75
const CORNER_Y = 22
const CORNER_X = HOOP - Math.sqrt(THREE_R ** 2 - CORNER_Y ** 2) // ≈ 32.8

function halfLines(sign) {
  const g = s('g')
  const x = (v) => (sign * v).toFixed(2)
  const sweepOut = sign > 0 ? 0 : 1
  const sweepIn = sign > 0 ? 1 : 0
  // key (lane) 16 x 19 from the baseline
  g.append(s('rect', { x: Math.min(sign * 47, sign * 28), y: -8, width: 19, height: 16 }))
  // free-throw circle
  g.append(s('circle', { cx: x(28), cy: 0, r: 6 }))
  // restricted area
  g.append(s('path', { d: `M ${x(HOOP)} -4 A 4 4 0 0 ${sweepOut} ${x(HOOP)} 4` }))
  // backboard + hoop
  g.append(s('line', { x1: x(43), y1: -3, x2: x(43), y2: 3 }))
  g.append(s('circle', { cx: x(HOOP), cy: 0, r: 0.75 }))
  // three-point line: corners + arc
  g.append(s('path', {
    d: `M ${x(47)} -${CORNER_Y} L ${x(CORNER_X)} -${CORNER_Y} A ${THREE_R} ${THREE_R} 0 0 ${sweepOut} ${x(CORNER_X)} ${CORNER_Y} L ${x(47)} ${CORNER_Y}`,
  }))
  void sweepIn
  return g
}

export function fullCourt({ stroke = 'var(--line)', width = 0.5, id } = {}) {
  const svg = s('svg', { viewBox: '-47.5 -25.5 95 51', role: 'img', 'aria-label': 'Basketball court', id })
  const g = s('g', { fill: 'none', stroke, 'stroke-width': width, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' })
  g.append(s('rect', { x: -47, y: -25, width: 94, height: 50, rx: 0.6 }))
  g.append(s('line', { x1: 0, y1: -25, x2: 0, y2: 25 }))
  g.append(s('circle', { cx: 0, cy: 0, r: 6 }))
  g.append(halfLines(1), halfLines(-1))
  svg.append(g)
  return svg
}

// The faint half-court that sits inside a game card. Right half, basket on the right.
export function cardCourt() {
  const svg = s('svg', { viewBox: '0 -25.5 47.5 51', preserveAspectRatio: 'xMaxYMid meet', 'aria-hidden': 'true' })
  const g = s('g', { fill: 'none', stroke: 'var(--line)', 'stroke-width': 0.45 })
  g.append(s('line', { x1: 0, y1: -25.5, x2: 0, y2: 25.5 }))
  g.append(s('circle', { cx: 0, cy: 0, r: 6 }))
  g.append(s('line', { x1: 0, y1: -25, x2: 47, y2: -25 }))
  g.append(s('line', { x1: 0, y1: 25, x2: 47, y2: 25 }))
  g.append(halfLines(1))
  svg.append(g)
  return svg
}

// Shot coordinates -> SVG user units (same as feet; y is already down-positive here, which just mirrors the court).
export const shotDot = ({ x, y, made }, { latest = false } = {}) => {
  const dot = made
    ? s('circle', { cx: x, cy: y, r: 0.95, fill: 'var(--ink)' })
    : s('circle', { cx: x, cy: y, r: 0.95, fill: 'none', stroke: 'var(--ink-2)', 'stroke-width': 0.4 })
  if (!latest) return dot
  const g = s('g')
  g.append(dot, s('circle', { cx: x, cy: y, r: 2.1, fill: 'none', stroke: 'var(--orange)', 'stroke-width': 0.5 }))
  return g
}
