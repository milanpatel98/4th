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
  const img = h('img', { src: url, alt: team.name, loading: 'lazy', decoding: 'async', width: 48, height: 48 })
  img.addEventListener('error', () => {
    img.remove()
    wrap.append(h('span.fb', text && team.abbr))
  })
  wrap.append(img)
  return wrap
}
