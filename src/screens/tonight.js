import { h, clear } from '../ui/dom.js'
import { gameCard } from '../ui/card.js'
import { fullCourt } from '../ui/court.js'
import { icons } from '../ui/icons.js'
import { loader } from '../ui/loader.js'
import { getDay, watch } from '../data.js'
import { todayStr, shiftDate, isValidDate, dayTitle, isCrunch, shortDate, followDay, dayInterval, remount } from '../util.js'

const wordmark = () => h('img.wordmark', { src: `${import.meta.env.BASE_URL}wordmark.png`, alt: '4TH', width: 1215, height: 413 })

export function mountTonight({ view, setDock }, { date, open } = {}) {
  const today = todayStr()
  const day = date && isValidDate(date) ? date : today
  const isToday = day === today
  setDock('tonight')

  const title = h('h1.h1', dayTitle(day))
  const stepper = h('div.stepper', { 'aria-label': 'Change day' },
    day !== today && h('button.day', { onclick: () => go(today), 'aria-label': 'Back to today' }, 'Today'),
    h('button', { 'aria-label': 'Previous day', onclick: () => go(shiftDate(day, -1)) }, icons.chevronLeft()),
    h('button', { 'aria-label': 'Next day', onclick: () => go(shiftDate(day, 1)) }, icons.chevronRight()),
  )
  const list = h('div.games', loader())
  view.append(
    h('header.top', wordmark()),
    h('div.day-row', title, stepper),
    list,
  )

  const cards = new Map()
  let first = true

  function go(d) { location.hash = d === today ? '#/' : `#/d/${d}` }

  function render(games) {
    setDock('tonight', { livePip: games.some(isCrunch) })

    if (!games.length) {
      clear(list)
      list.append(h('div.empty', fullCourt({ id: undefined }).cloneNode(true), h('span', 'No games this day.')))
      list.querySelector('svg')?.classList.add('court-empty')
      return
    }

    // Season → "open this matchup" deep link: jump straight into the game, keep this day as back target.
    if (first && open) {
      const [a, hm] = open.split('-')
      const match = games.find((g) => g.away.abbr === a && g.home.abbr === hm) || games.find((g) => g.away.abbr === hm && g.home.abbr === a)
      if (match) {
        location.replace(`#/g/${match.id}?back=${day}`)
        return
      }
    }
    first = false

    // reconcile cards by id, in feed order, without re-creating existing ones
    const seen = new Set()
    let cursor = list.firstElementChild
    if (cursor?.classList.contains('loader')) { clear(list); cursor = null }
    for (const g of games) {
      seen.add(g.id)
      let c = cards.get(g.id)
      if (!c) {
        c = gameCard(g, { href: `#/g/${g.id}${day !== today ? `?back=${day}` : ''}` })
        cards.set(g.id, c)
      } else c.update(g)
      if (cursor !== c.el) list.insertBefore(c.el, cursor)
      else cursor = cursor.nextElementSibling
    }
    for (const [id, c] of cards) if (!seen.has(id)) { c.el.remove(); cards.delete(id) }
  }

  // Today keeps polling (slowly when nothing is on) so tomorrow's slate appears on its own; past days stop when done.
  const stop = watch(() => getDay(day), render, {
    every: (games) => (games ? dayInterval(games) : 10000),
    shouldContinue: (games) => isToday || games.some((g) => g.state !== 'post'),
    onError: () => {
      if (cards.size || !list.querySelector('.loader')) return
      clear(list)
      list.append(h('div.empty', h('span', 'Could not load games.'), h('button.show-more', { onclick: () => location.reload() }, 'Try again')))
    },
  })
  // "#/" means today: follow the calendar overnight
  const stopDay = !date ? followDay(remount) : () => {}
  return () => { stop(); stopDay() }
}
