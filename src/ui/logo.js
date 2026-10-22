import { h } from './dom.js'
import { logoUrl } from '../teams.js'

// Official logo from cdn.nba.com; falls back to a ringed abbreviation when it can't load.
export function logo(team, size = '', { text = true } = {}) {
  const wrap = h(`span.logo${size ? '.' + size : ''}`, { title: team.name })
  const url = logoUrl(team.nbaId)
  if (!url) {
    wrap.append(h('span.fb', text && team.abbr))
    return wrap
  }
  const img = h('img', { src: url, alt: team.name, decoding: 'async', width: 48, height: 48 })
  const show = () => img.classList.add('on')
  if (img.complete && img.naturalWidth) show()
  else img.addEventListener('load', show, { once: true })
  img.addEventListener('error', () => {
    img.remove()
    wrap.append(h('span.fb', text && team.abbr))
  })
  wrap.append(img)
  return wrap
}

// Warm the browser cache with every team's logo once, so lists never pop in logo by logo.
export function preloadLogos(ids) {
  const go = () => ids.forEach((id) => { const i = new Image(); i.decoding = 'async'; i.src = logoUrl(id) })
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 })
  else setTimeout(go, 300)
}
