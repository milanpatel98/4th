import { h } from './dom.js'

// Loading state: his white outline basketball, turning slowly. Still when reduced motion is on.
export const loader = () =>
  h('div.loader', { role: 'status', 'aria-label': 'Loading' },
    h('img', { src: `${import.meta.env.BASE_URL}ball.png`, alt: '', width: 40, height: 40 }),
  )
