// Data feed for 4TH. The UI only talks to this module.
//
//   getDay(dateStr 'YYYYMMDD') -> Promise<Game[]>
//   getGame(id)                -> Promise<GameDetail>
//   getSeason()                -> Promise<Season>
//   watch(fetcher, onData, { every }) -> stop()   polling helper used by live screens
//
// Backed by ESPN's public feed (espn.js). mock.js has the same shapes for offline work.
export { getDay, getGame, getSeason } from './espn.js'

// Poll a fetcher while the page is visible. Calls onData with each fresh result.
// `shouldContinue(data)` lets the caller stop polling once nothing is live.
export function watch(fetcher, onData, { every = 10000, shouldContinue = () => true, onError } = {}) {
  const delay = (data) => (typeof every === 'function' ? every(data) : every)
  let timer = null
  let stopped = false
  let inflight = false

  let last = null
  async function tick() {
    if (stopped || inflight) return
    inflight = true
    try {
      const data = await fetcher()
      if (stopped) return
      last = data
      onData(data)
      if (!shouldContinue(data)) return
    } catch (e) {
      // keep whatever is on screen; try again next tick
      if (onError) onError(e, last)
    } finally {
      inflight = false
    }
    if (!stopped) timer = setTimeout(tick, document.hidden ? delay(last) * 3 : delay(last))
  }

  const onVis = () => {
    if (!document.hidden && !stopped) {
      clearTimeout(timer)
      tick()
    }
  }
  document.addEventListener('visibilitychange', onVis)
  tick()

  return () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVis)
  }
}
