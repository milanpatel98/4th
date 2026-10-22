import { h, clear } from '../ui/dom.js'
import { gameCard } from '../ui/card.js'
import { fullCourt } from '../ui/court.js'
import { loader } from '../ui/loader.js'
import { getDay, watch } from '../data.js'
import { todayStr, tipTime, isCrunch, followDay, dayInterval, remount } from '../util.js'

const wordmark = () => h('img.wordmark', { src: `${import.meta.env.BASE_URL}wordmark.png`, alt: '4TH', width: 1215, height: 413 })

// Live: only the games in progress right now. Crunch-time games first.
export function mountLive({ view, setDock }) {
  setDock('live')
  const list = h('div.games', loader())
  view.append(h('header.top', wordmark()), h('div', { style: { marginBottom: '14px' } }, h('h1.h1', 'Live')), list)

  const cards = new Map()
  const today = todayStr()

  function render(games) {
    const live = games.filter((g) => g.state === 'in')
    setDock('live', { livePip: live.some(isCrunch) })
    if (!live.length) {
      clear(list); cards.clear()
      const next = games.filter((g) => g.state === 'pre').sort((a, b) => a.start.localeCompare(b.start))[0]
      const court = fullCourt(); court.classList.add('court-empty')
      list.append(h('div.empty', court, h('span', next ? `Nothing live right now. Next tip-off ${tipTime(next.start)}.` : 'Nothing live right now.')))
      return
    }
    if (list.firstElementChild?.classList.contains('loader') || list.querySelector('.empty')) clear(list)
    const order = [...live].sort((a, b) => Number(b.period >= 4) - Number(a.period >= 4))
    const seen = new Set()
    let cursor = list.firstElementChild
    for (const g of order) {
      seen.add(g.id)
      let c = cards.get(g.id)
      if (!c) { c = gameCard(g, { href: `#/g/${g.id}` }); cards.set(g.id, c) } else c.update(g)
      if (cursor !== c.el) list.insertBefore(c.el, cursor)
      else cursor = cursor.nextElementSibling
    }
    for (const [id, c] of cards) if (!seen.has(id)) { c.el.remove(); cards.delete(id) }
  }

  const stop = watch(() => getDay(today), render, { every: (games) => (games ? dayInterval(games) : 10000) })
  const stopDay = followDay(remount)
  return () => { stop(); stopDay() }
}
