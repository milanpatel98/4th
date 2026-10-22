import { h, signedPct } from '../ui/dom.js'
import { logo } from '../ui/logo.js'
import { loader } from '../ui/loader.js'
import { getSeason } from '../data.js'
import { nbaId, teamName } from '../teams.js'
import { shortDate, todayStr } from '../util.js'

const wordmark = () => h('img.wordmark', { src: `${import.meta.env.BASE_URL}wordmark.png`, alt: '4TH', width: 1215, height: 413 })
const t = (abbr) => ({ abbr, nbaId: nbaId(abbr), name: teamName(abbr) })

export function mountSeason({ view, setDock }) {
  setDock('season')
  const body = loader()
  view.append(h('header.top', wordmark()), body)
  let alive = true

  getSeason().then((season) => {
    if (!alive) return
    const list = season.seasons?.length ? season.seasons : [season]
    if (list.length < 2) { body.replaceWith(render(season)); return }
    // switch between this season (grows every night) and last season
    let current = h('div')
    const buttons = list.map((s, i) => h('button', { 'aria-pressed': String(i === 0), onclick: () => pick(i) }, i === 0 ? 'This season' : s.season))
    const seg = h('div.seg.season-seg', { role: 'group', 'aria-label': 'Season' }, buttons)
    function pick(i) {
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)))
      const s = list[i]
      const next = render({ ...s, clutchSeason: s.season })
      current.replaceWith(next)
      current = next
    }
    view.querySelector('header.top').append(seg)
    body.replaceWith(current)
    pick(0)
  }).catch(() => {
    if (alive) body.textContent = 'Could not load the season.'
  })

  return () => { alive = false }
}

function render(season) {
  const { flipped, clutch } = season
  const today = todayStr()

  // games flipped by a wrong call
  const PAGE = 8
  const flips = h('div.flips')
  let shown = 0
  const more = h('button.show-more', { onclick: () => { addRows(); } })
  function addRows() {
    const next = flipped.games.slice(shown, shown + PAGE)
    for (const g of next) flips.append(flipRow(g, today))
    shown += next.length
    const left = flipped.games.length - shown
    if (left > 0) more.textContent = `Show ${Math.min(left, PAGE)} more`
    else more.remove()
  }
  addRows()

  const flippedSection = h('section.section',
    h('div.hero-n',
      h('span.n.num', String(flipped.count)),
      h('span.l', `games flipped by a wrong call, ${season.season}`),
    ),
    h('div.section-h', { style: { marginTop: '22px' } }, h('h2', 'The games'), h('span.sub', 'tap to open')),
    flips,
    flipped.games.length > PAGE && more,
    !flipped.games.length && h('div.quiet', 'No game has turned on a wrong call yet this season.'),
  )

  // most clutch
  const max = Math.max(0.01, ...clutch.map((c) => c.wpa))
  const board = h('div.board', clutch.map((c, i) =>
    h('div.rank', { class: `rank${i === 0 ? ' first' : ''}` },
      h('span.i.num', i + 1),
      h('span.n', c.name, h('small', c.team)),
      h('span.v.num', `+${c.wpa.toFixed(1)}`, h('small', 'wins')),
      h('span.bar', { 'aria-hidden': 'true' }, h('i', { style: { width: `${(c.wpa / max) * 100}%` } })),
    ),
  ))
  const clutchSection = h('section.section',
    h('div.section-h', h('h2', 'Most clutch'), h('span.sub', `wins added in 4th quarters, ${season.clutchSeason || season.season}`)),
    board,
  )

  const foot = h('footer.foot',
    h('span', 'Wrong calls come from the NBA\'s own Last Two Minute reports.'),
    h('span', 'Unofficial fan project. Not affiliated with the NBA.'),
    h('span', '© 2026 Milan Patel · MIT License'),
  )

  return h('div', h('div.season-grid', flippedSection, clutchSection), foot)
}

function flipRow(g, today) {
  const date = g.gameDate === today ? '#/' : `#/d/${g.gameDate}`
  const href = `${date}?g=${g.away}-${g.home}`
  const homeWon = g.winner === g.home
  return h('a.flip', { href, 'aria-label': `${g.away} ${g.awayScore} at ${g.home} ${g.homeScore}, ${shortDate(g.gameDate)}` },
    h('span.date', shortDate(g.gameDate)),
    h('span.match',
      logo(t(g.away), 'sm'), h('span', { class: `s${homeWon ? ' l' : ''}` }, g.awayScore),
      h('span.at', 'at'),
      logo(t(g.home), 'sm'), h('span', { class: `s${homeWon ? '' : ' l'}` }, g.homeScore),
    ),
    h('span.cost', h('b', `−${Math.round(Math.abs(g.cost) * 100)}%`), h('small', g.lostBy != null ? `${g.wronged || ''} lost by ${g.lostBy}`.trim() : `to ${g.winner}, ${g.clock} left`)),
  )
}
