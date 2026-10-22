const SVG_NS = 'http://www.w3.org/2000/svg'

// h('div.card.hot', { onclick }, child, 'text', [list])
export function h(sel, attrs, ...children) {
  if (attrs && (attrs instanceof Node || typeof attrs !== 'object' || Array.isArray(attrs))) {
    children.unshift(attrs)
    attrs = null
  }
  const [tag, ...classes] = sel.split('.')
  const el = document.createElement(tag || 'div')
  if (classes.length) el.className = classes.join(' ')
  apply(el, attrs)
  append(el, children)
  return el
}

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag)
  apply(el, attrs)
  append(el, children)
  return el
}

function apply(el, attrs) {
  if (!attrs) return
  for (const k in attrs) {
    const v = attrs[k]
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'class') el.setAttribute('class', v)
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else el.setAttribute(k, v === true ? '' : v)
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild) }

export function setText(el, text) {
  const t = String(text)
  if (el.textContent !== t) el.textContent = t
}

export const pct = (v, digits = 0) => (v == null ? '–' : `${Math.round(v * 100 * 10 ** digits) / 10 ** digits}%`)
export const signedPct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v * 100)) + '%'
export const esc = (t) => t
