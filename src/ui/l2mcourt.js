import { h, s, signedPct } from './dom.js'
import { fullCourt } from './court.js'

// "Last two minutes" court: the deciding plays pinned where they happened, and the referees'
// wrong calls as × marks by the basket of the team they hurt. Labels are placed greedily so they
// never overlap each other or leave the court.
// Units are feet (same as the court); text is sized in feet too so it scales with the court.

const FONT = 3.1            // label font size, feet
const CHAR = 1.75           // approx width of one character at that size
const PAD = 1.2
const X_MIN = -46, X_MAX = 46, Y_MIN = -24, Y_MAX = 24

const lastName = (name = '') => name.split(' ').pop()

function labelBox(x, y, w, hgt, place) {
  const r = 2.6 // keep clear of the marker
  if (place === 'right') return { x: x + r, y: y - hgt / 2, w, h: hgt }
  if (place === 'left') return { x: x - r - w, y: y - hgt / 2, w, h: hgt }
  if (place === 'above') return { x: x - w / 2, y: y - r - hgt, w, h: hgt }
  return { x: x - w / 2, y: y + r, w, h: hgt }
}
const overlaps = (a, b) => !(a.x + a.w < b.x - PAD || b.x + b.w < a.x - PAD || a.y + a.h < b.y - PAD || b.y + b.h < a.y - PAD)
const inside = (b) => b.x >= X_MIN && b.x + b.w <= X_MAX && b.y >= Y_MIN && b.y + b.h <= Y_MAX

export function l2mCourt() {
  const court = fullCourt()
  const marks = s('g')
  const labels = s('g', { 'font-size': FONT, 'font-weight': 700, 'font-family': 'inherit' })
  court.append(marks, labels)
  const el = h('div.court-wrap.l2m-court', court)

  function update({ pins }) {
    marks.replaceChildren()
    labels.replaceChildren()
    const taken = pins.map((p) => ({ x: p.x - 1.4, y: p.y - 1.4, w: 2.8, h: 2.8, pin: p }))
    // bigger swings first so they get the best spots
    const order = [...pins].sort((a, b) => Math.abs(b.weight ?? 0) - Math.abs(a.weight ?? 0))
    for (const p of order) {
      const w = p.text.length * CHAR
      const prefer = p.x > 0 ? ['left', 'above', 'below', 'right'] : ['right', 'above', 'below', 'left']
      let box = null, place = null
      for (const pl of prefer) {
        const b = labelBox(p.x, p.y, w, FONT, pl)
        if (inside(b) && !taken.some((t) => t.pin !== p && overlaps(t, b))) { box = b; place = pl; break }
      }
      if (p.kind === 'call') {
        marks.append(s('path', { d: `M${p.x - 1.5} ${p.y - 1.5} L${p.x + 1.5} ${p.y + 1.5} M${p.x + 1.5} ${p.y - 1.5} L${p.x - 1.5} ${p.y + 1.5}`, stroke: 'var(--orange)', 'stroke-width': 0.6, 'stroke-linecap': 'round' }))
      } else {
        marks.append(p.made
          ? s('circle', { cx: p.x, cy: p.y, r: 1.3, fill: 'var(--ink)' })
          : s('circle', { cx: p.x, cy: p.y, r: 1.3, fill: 'none', stroke: 'var(--ink-2)', 'stroke-width': 0.45 }))
        if (p.latest) marks.append(s('circle', { cx: p.x, cy: p.y, r: 2.4, fill: 'none', stroke: 'var(--orange)', 'stroke-width': 0.5 }))
      }
      if (!box) continue
      taken.push(box)
      const anchor = place === 'right' ? 'start' : place === 'left' ? 'end' : 'middle'
      const tx = place === 'right' ? box.x : place === 'left' ? box.x + box.w : box.x + box.w / 2
      const ty = box.y + box.h * 0.82
      labels.append(s('text', { x: tx, y: ty, 'text-anchor': anchor, fill: p.kind === 'call' ? 'var(--orange)' : 'var(--ink)' }, p.text))
    }
  }

  return { el, update }
}

// Build the pins for a game: top swing plays with a shot in the last 2:00 of the 4th + OT, and the wrong calls.
export function l2mPins(detail, { live = false } = {}) {
  const { plays, l2m, game } = detail
  const late = (p) => p.period > 4 || (p.period === 4 && p.t >= 2880 - 120)
  const swings = []
  for (let i = 1; i < plays.length; i++) {
    const p = plays[i]
    if (!p.side || !late(p)) continue
    const delta = p.wp - plays[i - 1].wp
    swings.push({ ...p, delta, own: p.side === 'home' ? delta : -delta })
  }
  const bySize = [...swings].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const shots = bySize.filter((p) => p.shot).slice(0, 4)
  const rows = bySize.filter((p) => !p.shot && Math.abs(p.delta) >= 0.05).slice(0, 2)
  const lastPlay = plays[plays.length - 1]

  const pins = shots.map((p) => ({
    kind: 'play', x: p.shot.x, y: p.shot.y, made: p.shot.made, weight: p.delta,
    text: `${lastName(p.player || '')} ${signedPct(p.own)}`.trim(),
    latest: live && p.seq === lastPlay.seq,
  }))

  // wrong calls: no coordinates, so sit them by the basket of the team they hurt
  const offsets = [[-8, -12], [-8, 12], [-15, -5], [-15, 6], [-22, -12], [-22, 12]]
  ;(l2m || []).filter((c) => Math.abs(c.cost) >= 0.03).forEach((c, i) => {
    const hurtHome = c.team ? c.team === game.home.abbr : c.cost < 0
    const [dx, dy] = offsets[i % offsets.length]
    const bx = hurtHome ? 41.75 : -41.75
    pins.push({
      kind: 'call', x: hurtHome ? bx + dx : bx - dx, y: dy, weight: 1 + Math.abs(c.cost),
      text: `${callWord(c)} −${Math.round(Math.abs(c.cost) * 100)}%`,
    })
  })

  return { pins, rows, swings }
}

// "Foul: Shooting" + INC -> "missed foul"; IC -> "wrong call"
export function callWord(c) {
  const base = /foul/i.test(c.call) ? 'foul' : /travel/i.test(c.call) ? 'travel' : /out of bounds/i.test(c.call) ? 'out of bounds'
    : /goaltend/i.test(c.call) ? 'goaltend' : /lane|3 second|three second/i.test(c.call) ? 'violation' : /turnover/i.test(c.call) ? 'turnover' : 'call'
  return c.decision === 'IC' ? `wrong ${base} call` : `missed ${base}`
}
