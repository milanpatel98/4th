import { h, setText, pct } from './dom.js'
import { logo } from './logo.js'
import { cardCourt } from './court.js'
import { tipTime, periodWord, isCrunch } from '../util.js'

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function statusText(g) {
  if (g.state === 'pre') return tipTime(g.start)
  if (g.state === 'post') return `${g.detail || 'Final'} · started ${tipTime(g.start)}`
  if (g.detail) return g.detail
  return `${periodWord(g.period)} ${g.clock}`
}

// A game card for Tonight. Keeps references so live updates only touch the changed text.
export function gameCard(game, { href }) {
  const away = teamRow(game.away)
  const home = teamRow(game.home)
  const status = h('div.status')
  const side = h('div.side')
  const el = h('a.card', { href, dataset: { id: game.id } },
    h('div.court-bg', { 'aria-hidden': 'true' }, cardCourt()),
    h('div.teams', away.el, home.el, status),
    side,
  )

  let prev = null

  function update(g) {
    el.classList.toggle('pre', g.state === 'pre')
    el.classList.toggle('in', g.state === 'in')
    el.classList.toggle('post', g.state === 'post')
    const hot = isCrunch(g)
    el.classList.toggle('hot', hot)

    away.update(g.away, g, prev?.away)
    home.update(g.home, g, prev?.home)

    // status
    const txt = statusText(g)
    const wantDot = g.state === 'in'
    const dot = status.querySelector('.live-dot')
    if (wantDot && !dot) status.prepend(h('span.live-dot', { 'aria-hidden': 'true' }))
    if (!wantDot && dot) dot.remove()
    const span = status.querySelector('span.txt') || status.appendChild(h('span.txt'))
    setText(span, txt)
    el.setAttribute('aria-label', `${g.away.name} at ${g.home.name}, ${txt}`)

    // right side: the favourite and their chance to win (before and during), nothing after
    const key = g.state === 'post' || g.wp == null ? 'none' : 'pct'
    if (side.dataset.key !== key) {
      side.dataset.key = key
      side.replaceChildren()
      if (key === 'pct') side.append(h('span.pct.num'), h('span.lbl'))
    }
    if (key === 'pct') {
      const fav = g.wp >= 0.5 ? g.home : g.away
      setText(side.querySelector('.pct'), pct(Math.max(g.wp, 1 - g.wp)))
      setText(side.querySelector('.lbl'), `${fav.abbr} to win`)
    }
    prev = g
  }

  update(game)
  return { el, update }
}

function teamRow(team) {
  const name = h('span.name', team.name)
  const record = h('span.record')
  const pts = h('span.pts.score')
  const el = h('div.team', logo(team), name, record, pts)
  function update(t, g, before) {
    setText(name, t.name)
    setText(record, g.state === 'pre' && t.record ? t.record : '')
    const text = t.score == null ? '' : String(t.score)
    if (pts.textContent !== text) {
      setText(pts, text)
      if (before && before.score != null && t.score !== before.score && !reduceMotion()) {
        pts.classList.remove('tick')
        void pts.offsetWidth
        pts.classList.add('tick')
      }
    }
    const other = t === g.home ? g.away : g.home
    el.classList.toggle('lead', t.score != null && other.score != null && t.score > other.score)
  }
  return { el, update }
}
