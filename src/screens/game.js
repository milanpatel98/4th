import { h, s, clear, setText, pct, signedPct } from '../ui/dom.js'
import { logo } from '../ui/logo.js'
import { endedWord } from '../ui/card.js'
import { fullCourt, shotDot } from '../ui/court.js'
import { wpChart } from '../ui/wpchart.js'
import { l2mCourt, l2mPins, callWord } from '../ui/l2mcourt.js'
import { icons } from '../ui/icons.js'
import { loader } from '../ui/loader.js'
import { getGame, watch } from '../data.js'
import { tipTime, periodLabel, periodWord, isCrunch, isLastTwo, todayStr } from '../util.js'

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const lastName = (name = '') => name.split(' ').pop()

export function mountGame({ view, setDock }, { id, back }) {
  setDock('tonight')
  const backHref = back && back !== todayStr() ? `#/d/${back}` : '#/'
  view.append(
    h('header.top', h('a.back', { href: backHref, 'aria-label': 'Back' }, icons.chevronLeft())),
    loader(),
  )

  let ui = null

  function render(d) {
    if (!ui) {
      view.querySelector('.loader')?.remove()
      ui = build(d)
      view.append(ui.el)
    }
    ui.update(d)
    setDock('tonight', { livePip: isCrunch(d.game) })
  }

  // Poll every 10 s while live, every 60 s before tip-off (so pre → live switches in place), stop once ended.
  return watch(() => getGame(id), render, {
    every: (d) => (d?.game.state === 'in' ? 10000 : 60000),
    shouldContinue: (d) => d.game.state !== 'post',
    onError: () => {
      if (ui) return
      view.querySelector('.loader')?.replaceWith(h('div.empty', h('span', 'Could not load this game.')))
    },
  })
}

function build(detail) {
  const { game } = detail

  // --- scoreboard ---
  const awayPts = h('div.big.score.num')
  const homePts = h('div.big.score.num')
  const mid = h('div.mid')
  const board = h('div.scoreboard',
    h('div.side-team', logo(game.away, 'lg', { text: false }), h('span.abbr', game.away.abbr), awayPts),
    mid,
    h('div.side-team', logo(game.home, 'lg', { text: false }), h('span.abbr', game.home.abbr), homePts),
  )

  // --- shots ---
  const court = fullCourt()
  const dots = s('g')
  court.append(dots)
  let shotMode = game.period >= 4 || game.state === 'post' ? '4th' : 'all'
  const segAll = h('button', { 'aria-pressed': String(shotMode === 'all'), onclick: () => setMode('all') }, 'All')
  const seg4 = h('button', { 'aria-pressed': String(shotMode === '4th'), onclick: () => setMode('4th') }, '4th')
  const shotsPanel = h('div.panel',
    h('div.panel-h', h('h2', 'Shots'), h('div.seg', { role: 'group', 'aria-label': 'Which shots' }, segAll, seg4)),
    h('div.court-wrap', court),
    h('div.court-ends', h('span', game.away.abbr), h('span.legend', h('span', h('i.made'), 'made'), h('span', h('i.miss'), 'missed')), h('span', game.home.abbr)),
  )

  // --- win chance: home team's line; logos mark which end is whose ---
  const chart = wpChart()
  const wpVal = h('span.val.num')
  const wpPanel = h('div.panel.wp-wrap',
    h('div.panel-h', h('h2', 'Win chance'), h('span.wp-now', logo(game.home, 'sm'), wpVal)),
    h('div.wp-plot', chart.svg, h('span.wp-end.top', logo(game.home, 'sm')), h('span.wp-end.bottom', logo(game.away, 'sm'))),
  )

  // --- swings (live, before the last two minutes) ---
  const swingsList = h('div.plays')
  const swingsPanel = h('div.panel', h('div.panel-h', h('h2', 'Swings')), swingsList)

  // --- last two minutes: the deciding plays on the court, then the refs ---
  const l2m = l2mCourt()
  const l2mTitle = h('h2', 'Last two minutes')
  const l2mSub = h('span.sub')
  const l2mRows = h('div.plays')
  const calls = h('div.calls')
  const l2mNote = h('div.quiet.l2m-note')
  const l2mPanel = h('div.panel', h('div.panel-h', l2mTitle, l2mSub), l2m.el, l2mRows, calls, l2mNote)

  // --- after: who closed it, drama ---
  const after = h('div.col')

  // phone order: last two minutes, win chance, who closed it, drama, shots (desktop keeps two columns)
  shotsPanel.style.setProperty('--o', 4)
  wpPanel.style.setProperty('--o', 2)
  swingsPanel.style.setProperty('--o', 3)
  l2mPanel.style.setProperty('--o', 1)
  after.style.setProperty('--o', 3)
  const left = h('div.col', shotsPanel)
  const right = h('div.col', wpPanel, swingsPanel)
  const body = h('div.two', left, right)
  const el = h('div', board, body)

  // before tip-off: just the court and the favourite
  let mode = null // 'pre' | 'live' | 'late' | 'post'
  let prePanel = null
  function setLayout(next) {
    if (mode === next) return
    mode = next
    if (next === 'pre') {
      const g = detail.game
      prePanel = h('div.panel.pre-panel',
        h('div.court-wrap', fullCourt()),
        g.wp == null ? null : h('div.pre-line', h('span.pct.num', pct(Math.max(g.wp, 1 - g.wp))), h('span', `${(g.wp >= 0.5 ? g.home : g.away).abbr} to win`)),
        h('div.pre-note', [g.away, g.home].filter((t) => t.record).map((t) => `${t.abbr} ${t.record}`).join('   ')),
      )
      if (body.isConnected) body.replaceWith(prePanel)
      else el.append(prePanel)
      return
    }
    if (prePanel?.isConnected) prePanel.replaceWith(body)
    else if (!body.isConnected) el.append(body)
    // live: shots | win chance + swings.  late/post: last two minutes | win chance + closers + drama + shots
    if (next === 'live') {
      shotsPanel.style.setProperty('--o', 1)
      left.replaceChildren(shotsPanel)
      right.replaceChildren(wpPanel, swingsPanel)
    } else {
      shotsPanel.style.setProperty('--o', 4)
      left.replaceChildren(l2mPanel, shotsPanel)
      right.replaceChildren(wpPanel, next === 'late' ? swingsPanel : after)
    }
  }

  let drawn = new Set()
  let lastDetail = detail
  let latestSeq = null

  function setMode(m) {
    shotMode = m
    segAll.setAttribute('aria-pressed', String(m === 'all'))
    seg4.setAttribute('aria-pressed', String(m === '4th'))
    clear(dots); drawn = new Set(); latestSeq = null
    if (lastDetail) drawShots(lastDetail)
  }

  function drawShots(d) {
    const plays = d.plays.filter((p) => p.shot && (shotMode === 'all' || p.period >= 4))
    const lastShot = plays[plays.length - 1]
    for (const p of plays) {
      if (drawn.has(p.seq)) continue
      drawn.add(p.seq)
      dots.append(shotDot(p.shot))
    }
    // orange ring on the latest shot while live
    if (d.game.state === 'in' && lastShot && lastShot.seq !== latestSeq) {
      dots.querySelector('.latest')?.remove()
      dots.append(s('circle', { class: 'latest', cx: lastShot.shot.x, cy: lastShot.shot.y, r: 2.1, fill: 'none', stroke: 'var(--orange)', 'stroke-width': 0.5 }))
      latestSeq = lastShot.seq
    }
    if (d.game.state !== 'in') dots.querySelector('.latest')?.remove()
  }

  function updateBoard(g, before) {
    const set = (el, t, bef) => {
      const txt = t == null ? '' : String(t)
      if (el.textContent === txt) return
      setText(el, txt)
      if (bef != null && t != null && !reduceMotion()) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick') }
    }
    set(awayPts, g.away.score, before?.away.score)
    set(homePts, g.home.score, before?.home.score)
    const lead = g.home.score != null && g.away.score != null ? Math.sign(g.home.score - g.away.score) : 0
    homePts.classList.toggle('trail', lead < 0)
    awayPts.classList.toggle('trail', lead > 0)

    board.classList.toggle('hot', isCrunch(g))
    board.classList.toggle('done', g.state === 'post')
    const key = g.state === 'pre' ? 'pre' : g.state === 'post' ? `post:${g.detail}:${g.endedAt || ''}` : `in:${g.period}:${g.clock}`
    if (mid.dataset.key === key) return
    mid.dataset.key = key
    mid.replaceChildren()
    if (g.state === 'pre') mid.append(h('span.tip', tipTime(g.start)), h('span.tipsub', 'tip-off'))
    else if (g.state === 'post') mid.append(h('span.period', endedWord(g)), g.endedAt ? h('span.tipsub', tipTime(g.endedAt)) : '')
    else mid.append(h('span.period', periodLabel(g.period)), h('span.clock', g.clock))
  }

  // A play row: team, bold player, what happened, when; the change in that team's own win chance.
  function playRow(d, p) {
    const team = p.side === 'home' ? d.game.home.abbr : p.side === 'away' ? d.game.away.abbr : ''
    const name = p.player && p.text.startsWith(p.player) ? p.player : p.text.split(' ')[0]
    const rest = p.text.slice(name.length).trim()
    const own = p.side === 'away' ? -p.delta : p.delta
    return h('div.play',
      h('span.who', team),
      h('span.what', h('b', lastName(name)), ' ', rest, h('span.when', `${periodWord(p.period)} ${p.clock}`)),
      h('span', { class: `delta num${own < 0 ? ' neg' : ''}` }, signedPct(own)),
    )
  }

  function renderSwings(d) {
    const top = d.swings.slice(0, 5)
    const key = top.map((p) => p.seq).join(',')
    if (swingsList.dataset.key === key) return
    swingsList.dataset.key = key
    swingsList.replaceChildren(...top.map((p) => playRow(d, p)))
    if (!top.length) swingsList.append(h('div.quiet', 'Nothing big yet.'))
  }

  function renderL2M(d) {
    const g = d.game
    const live = g.state === 'in'
    const { pins, rows } = l2mPins(d, { live })
    const key = JSON.stringify([pins.map((p) => p.text), rows.map((r) => r.seq), g.state])
    if (l2mPanel.dataset.key === key) return
    l2mPanel.dataset.key = key

    l2m.update({ pins })
    l2mSub.textContent = live ? 'so far' : ''
    l2mRows.replaceChildren(...rows.map((p) => playRow(d, p)))

    calls.replaceChildren()
    l2mNote.textContent = ''
    if (live) {
      if (!pins.length && !rows.length) l2mNote.textContent = 'Nothing big yet.'
      return
    }
    if (d.l2m && d.l2m.length) {
      for (const c of d.l2m) {
        const row = h('div.call')
        const btn = h('button', { 'aria-expanded': 'false', onclick: () => { const o = row.classList.toggle('open'); btn.setAttribute('aria-expanded', String(o)) } },
          h('span.x', { 'aria-hidden': 'true' }, '×'),
          h('span.what', capital(callWord(c)), c.committing ? ` on ${lastName(c.committing)}` : '', h('span.when', `${periodWord(c.period)} ${c.clock}`)),
          h('span.cost.num', `−${Math.round(Math.abs(c.cost) * 100)}%`),
        )
        row.append(btn, h('div.comment', c.comment))
        calls.append(row)
      }
      calls.append(h('div.source', 'NBA Last Two Minute report'))
    } else if (d.l2m) {
      l2mNote.textContent = 'Refs got every call right.'
    } else {
      l2mNote.textContent = ''
    }
  }

  function renderAfter(d) {
    const g = d.game
    if (g.state !== 'post' || after.dataset.done) return
    after.dataset.done = '1'

    // who closed it: each player's win chance added in the 4th and OT, all for their own team
    const max = Math.max(0.01, ...d.closers.map((c) => Math.abs(c.wpa)))
    const closers = d.closers.slice(0, 5).map((c) =>
      h('div.closer',
        h('span.n', lastName(c.name), h('small', c.side === 'home' ? g.home.abbr : g.away.abbr)),
        h('span.v.num', signedPct(c.wpa)),
        h('span.bar', { 'aria-hidden': 'true' }, h('i', { style: { width: `${(Math.abs(c.wpa) / max) * 100}%` } })),
      ),
    )
    const closersPanel = h('div.panel',
      h('div.panel-h', h('h2', 'Who closed it'), h('span.sub', `4th${(d.plays.at(-1)?.period ?? 4) > 4 ? ' + OT' : ''}`)),
      closers.length ? h('div.closers', closers) : h('div.quiet', 'No player data for this game.'),
    )

    const dramaPanel = d.drama == null ? null : h('div.panel.drama-panel',
      h('div.drama', h('h2', 'Drama'), h('span.n.num', d.drama, h('small', '/100'))),
      h('div.drama-bar', { 'aria-hidden': 'true' }, h('i', { style: { width: `${d.drama}%` } })),
    )

    after.append(closersPanel, dramaPanel)
  }

  function update(d) {
    const g = d.game
    updateBoard(g, lastDetail?.game)
    detail = d
    setLayout(g.state === 'pre' ? 'pre' : g.state === 'post' ? 'post' : isLastTwo(g) ? 'late' : 'live')
    lastDetail = d
    if (g.state === 'pre') return
    setText(wpVal, g.wp == null ? '' : pct(g.wp))
    if (d.plays.length) chart.update(d.plays, g.state === 'post' ? g.period : Math.max(4, g.period))
    drawShots(d)
    if (mode !== 'post') renderSwings(d)
    if (mode !== 'live') renderL2M(d)
    renderAfter(d)
  }

  return { el, update }
}

const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1)
