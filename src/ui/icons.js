import { s } from './dom.js'

const svg = (...kids) => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, ...kids)

export const icons = {
  // win-chance line (Live)
  line: () => svg(s('path', { d: 'M3 16.5 8.5 10l4 3.5L21 5' }), s('path', { d: 'M3 20h18', 'stroke-opacity': 0.35 })),
  // leaderboard bars (Season)
  bars: () => svg(s('path', { d: 'M5 20v-7' }), s('path', { d: 'M12 20V5' }), s('path', { d: 'M19 20v-11' })),
  chevronLeft: () => svg(s('path', { d: 'M14.5 6 9 12l5.5 6' })),
  chevronRight: () => svg(s('path', { d: 'M9.5 6 15 12l-5.5 6' })),
}
