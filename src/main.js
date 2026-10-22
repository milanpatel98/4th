import './styles.css'
import { h, clear } from './ui/dom.js'
import { mountTonight } from './screens/tonight.js'
import { mountGame } from './screens/game.js'
import { mountSeason } from './screens/season.js'
import { mountLive } from './screens/live.js'
import { icons } from './ui/icons.js'
import { preloadLogos } from './ui/logo.js'
import { TEAMS } from './teams.js'

const app = document.getElementById('app')
const view = h('main.shell', { id: 'view' })
const dock = buildDock()
app.append(view, dock)

let unmount = null

function buildDock() {
  const link = (href, label, icon, key) =>
    h('a', { href, 'aria-label': label, title: label, dataset: { key } }, icon)
  return h('nav.dock', { 'aria-label': 'Sections' },
    link('#/', 'Tonight', h('img', { src: `${import.meta.env.BASE_URL}ball.png`, alt: '', width: 26, height: 26 }), 'tonight'),
    link('#/live', 'Live', icons.line(), 'live'),
    link('#/season', 'Season', icons.bars(), 'season'),
  )
}

export function setDock(key, { livePip = false } = {}) {
  for (const a of dock.querySelectorAll('a')) {
    const on = a.dataset.key === key
    if (on) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
    if (a.dataset.key === 'live') {
      const pip = a.querySelector('.pip')
      if (livePip && !pip) a.append(h('span.pip', { 'aria-hidden': 'true' }))
      if (!livePip && pip) pip.remove()
    }
  }
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const params = Object.fromEntries(new URLSearchParams(query))
  const parts = path.split('/').filter(Boolean)
  return { parts, params }
}

function route() {
  if (unmount) { unmount(); unmount = null }
  clear(view)
  window.scrollTo(0, 0)
  const { parts, params } = parseHash()
  const ctx = { view, setDock }
  if (parts[0] === 'g' && parts[1]) unmount = mountGame(ctx, { id: parts[1], back: params.back })
  else if (parts[0] === 'd' && parts[1]) unmount = mountTonight(ctx, { date: parts[1], open: params.g })
  else if (parts[0] === 'live') unmount = mountLive(ctx)
  else if (parts[0] === 'season') unmount = mountSeason(ctx)
  else unmount = mountTonight(ctx, {})
}

window.addEventListener('hashchange', route)
route()

preloadLogos(Object.values(TEAMS).map((t) => t.id))
