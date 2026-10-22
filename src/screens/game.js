import { h, s, clear, setText, pct, signedPct } from '../ui/dom.js'
import { logo } from '../ui/logo.js'
import { fullCourt, shotDot } from '../ui/court.js'
import { wpChart } from '../ui/wpchart.js'
import { icons } from '../ui/icons.js'
import { loader } from '../ui/loader.js'
import { getGame, watch } from '../data.js'
import { tipTime, periodLabel, periodWord, isCrunch, todayStr } from '../util.js'

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function mountGame({ view, setDock }, { id, back }) {
  setDock('tonight')
  const backHref = back && back !== todayStr() ? `#/d/${back}` : '#/'
  view.append(
    h('header.top', h('a.back', { href: backHref }, icons.chevronLeft(), 'Back')),
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

  return watch(() => getGame(id), render, {
    every: 10000,
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

  // --- win chance ---
  const chart = wpChart()
  const wpVal = h('span.val.num')
  const wpTitle = h('h2')
  const wpPanel = h('div.panel.wp-wrap', h('div.panel-h', wpTitle, wpVal), chart.svg)

  // --- swings / after ---
  const swingsList = h('div.plays')
  const swingsTitle = h('h2', 'Swings')
  const swingsSub = h('span.sub')
  const swingsPanel = h('div.panel', h('div.panel-h', swingsTitle, swingsSub), swingsList)

  const after = h('div.col')

  const left = h('div.col', shotsPanel)
  const right = h('div.col', wpPanel, swingsPanel, after)
  const body = h('div.two', left, right)
  const el = h('div', board, body)

  // before tip-off: just the court and the close-finish chance
  let preMode = false
  function setPre(on, g) {
    if (preMode === on) return
    preMode = on
    if (on) {
      const prePanel = h('div.panel.pre-panel',
        h('div.court-wrap', fullCourt()),
        g.closeFinish == null ? null : h('div.pre-line', h('span.pct.num', pct(g.closeFinish)), h('span', 'chance of a close finish')),
        h('div.pre-note', `${g.away.record ? `${g.away.abbr} ${g.away.record}` : ''}${g.away.record && g.home.record ? '  ·  ' : ''}${g.home.record ? `${g.home.abbr} ${g.home.record}` : ''}`),
      )
      body.replaceWith(prePanel)
      el.prePanel = prePanel
    } else {
      el.prePanel?.replaceWith(body)
    }
  }

  let drawn = new Set()
  let lastDetail = null
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
      const ring = s('circle', { class: 'latest', cx: lastShot.shot.x, cy: lastShot.shot.y, r: 2.1, fill: 'none', stroke: 'var(--orange)', 'stroke-width': 0.5 })
      dots.append(ring)
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

    const hot = isCrunch(g)
    board.classList.toggle('hot', hot)
    board.classList.toggle('done', g.state === 'post')
    const key = g.state === 'pre' ? `pre` : g.state === 'post' ? `post:${g.detail}` : `in:${g.period}:${g.clock}`
    if (mid.dataset.key === key) return
    mid.dataset.key = key
    mid.replaceChildren()
    if (g.state === 'pre') mid.append(h('span.tip', tipTime(g.start)), h('span.tipsub', 'tip-off'))
    else if (g.state === 'post') mid.append(h('span.period', g.detail || 'Final'))
    else mid.append(h('span.period', periodLabel(g.period)), h('span.clock', g.clock))
  }

  function playRow(d, p) {
    const team = p.side === 'home' ? d.game.home.abbr : p.side === 'away' ? d.game.away.abbr : ''
    const name = p.player && p.text.startsWith(p.player) ? p.player : p.text.split(' ')[0]
    const rest = p.text.slice(name.length).trim()
    return h('div.play',
      h('span.who', team),
      h('span.what', h('b', name), ' ', rest, h('span.when', `${periodWord(p.period)} ${p.clock}`)),
      h('span.delta.num', { class: `delta num${p.delta < 0 ? ' neg' : ''}` }, signedPct(p.delta)),
    )
  }

  function renderSwings(d) {
    const g = d.game
    if (g.state === 'post') {
      swingsTitle.textContent = 'What decided it'
      swingsSub.textContent = 'last 2 minutes'
      // largest swings in the last two minutes of regulation and all of OT
      const plays = d.plays
      const rows = []
      for (let i = 1; i < plays.length; i++) {
        const p = plays[i]
        if (!p.side) continue
        const late = p.period > 4 || (p.period === 4 && p.t >= 2880 - 120)
        if (!late) continue
        rows.push({ seq: p.seq, text: p.text, player: p.player, side: p.side, delta: p.wp - plays[i - 1].wp, period: p.period, clock: p.clock })
      }
      rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      const top = rows.length ? rows.slice(0, 4) : d.swings.slice(0, 4)
      swingsList.replaceChildren(...top.map((p) => playRow(d, p)))
      if (!top.length) swingsList.append(h('div.quiet', 'No play-by-play for this game.'))
    } else {
      swingsTitle.textContent = 'Swings'
      swingsSub.textContent = `${g.home.abbr} win chance`
      const top = d.swings.slice(0, 5)
      const key = top.map((p) => p.seq).join(',')
      if (swingsList.dataset.key === key) return
      swingsList.dataset.key = key
      swingsList.replaceChildren(...top.map((p) => playRow(d, p)))
      if (!top.length) swingsList.append(h('div.quiet', g.state === 'pre' ? 'Tip-off first.' : 'Nothing big yet.'))
    }
  }

  function renderAfter(d) {
    const g = d.game
    if (g.state !== 'post' || after.dataset.done) return
    after.dataset.done = '1'

    // who closed it
    const max = Math.max(0.01, ...d.closers.map((c) => Math.abs(c.wpa)))
    const closers = d.closers.slice(0, 5).map((c) =>
      h('div.closer',
        h('span.n', c.name, h('small', c.side === 'home' ? g.home.abbr : g.away.abbr)),
        h('span.v.num', signedPct(c.wpa)),
        h('span.bar', h('i', { class: c.side === 'away' ? 'away' : '', style: { width: `${(Math.abs(c.wpa) / max) * 100}%` } })),
      ),
    )
    const closersPanel = h('div.panel',
      h('div.panel-h', h('h2', 'Who closed it'), h('span.sub', `win chance added, 4th${(d.plays.at(-1)?.period ?? 4) > 4 ? ' + OT' : ''}`)),
      closers.length ? h('div.closers', closers) : h('div.quiet', 'No player data for this game.'),
    )

    // drama
    const dramaPanel = d.drama == null ? null : h('div.panel',
      h('div.drama', h('h2', { style: { fontSize: '14px', fontWeight: 650 } }, 'Drama'), h('span.n.num', d.drama, h('small', '/100'))),
      h('div.drama-bar', { 'aria-hidden': 'true' }, h('i', { style: { width: `${d.drama}%` } })),
    )

    // last two minute report
    let l2mPanel
    if (d.l2m && d.l2m.length) {
      const rows = d.l2m.map((c) => {
        const row = h('div.call')
        const btn = h('button', { 'aria-expanded': 'false', onclick: () => { const o = row.classList.toggle('open'); btn.setAttribute('aria-expanded', String(o)) } },
          h('span.x', { 'aria-hidden': 'true' }, '×'),
          h('span',
            h('div.t', c.decision === 'IC' ? 'Wrong call' : 'Missed call', h('small', `${periodWord(c.period)} ${c.clock}`)),
            h('div.m', `${c.call} · ${c.committing} on ${c.disadvantaged}`.replace(' · ', ' — ')),
          ),
          h('span.cost.num', signedPct(c.cost)),
        )
        row.append(btn, h('div.comment', c.comment))
        return row
      })
      l2mPanel = h('div.panel',
        h('div.panel-h', h('h2', 'Calls the NBA got wrong'), h('span.sub', `${g.home.abbr} win chance`)),
        h('div.calls', rows),
        h('div.source', 'From the NBA\'s Last Two Minute report.'),
      )
    } else if (d.l2m && !d.l2m.length) {
      l2mPanel = h('div.panel', h('div.panel-h', h('h2', 'Calls the NBA got wrong')), h('div.quiet', 'None. The referees\' Last Two Minute report found no wrong calls.'))
    } else {
      l2mPanel = h('div.panel', h('div.panel-h', h('h2', 'Calls the NBA got wrong')),
        h('div.quiet', 'No Last Two Minute report for this game. The NBA only reviews games within 3 points in the last two minutes, a day or two later.'))
    }

    after.append(closersPanel, dramaPanel, l2mPanel)
  }

  function update(d) {
    const g = d.game
    updateBoard(g, lastDetail?.game)
    setPre(g.state === 'pre', g)
    if (g.state === 'pre') { lastDetail = d; return }
    wpTitle.textContent = `${g.home.name} win chance`
    setText(wpVal, g.wp == null ? '' : pct(g.wp))
    if (d.plays.length) chart.update(d.plays, g.state === 'post' ? g.period : Math.max(4, g.period))
    else wpPanel.querySelector('.quiet') || wpPanel.append(h('div.quiet', 'Updates once the game tips off.'))
    drawShots(d)
    renderSwings(d)
    renderAfter(d)
    lastDetail = d
  }

  return { el, update }
}
