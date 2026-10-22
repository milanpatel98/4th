// Mock feed. Same shapes as the real feed in data.js.
// Deterministic (seeded), so screens look the same on every load.
import { nbaId, teamName } from './teams.js'

// ---------- helpers ----------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
const pad = (n) => String(n).padStart(2, '0')
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
const shiftDate = (s, days) => {
  const d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
const isoAt = (dateStr, h, m) =>
  new Date(+dateStr.slice(0, 4), +dateStr.slice(4, 6) - 1, +dateStr.slice(6, 8), h, m).toISOString()
const clockOf = (secLeft) => `${Math.floor(secLeft / 60)}:${pad(Math.max(0, Math.floor(secLeft % 60)))}`

// Win probability for the home side from margin + time left.
function winProb(margin, secLeft) {
  if (secLeft <= 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5
  const z = ((margin + 0.6) * 0.5) / Math.sqrt(Math.max(secLeft, 1) / 60)
  return 1 / (1 + Math.exp(-z))
}

const ROSTER = {
  GSW: ['Curry', 'Butler', 'Green', 'Kuminga', 'Podziemski', 'Hield'],
  PHX: ['Booker', 'Durant', 'Beal', 'Allen', 'Nurkić', 'Dunn'],
  LAL: ['James', 'Dončić', 'Reaves', 'Hachimura', 'Ayton', 'Vincent'],
  BOS: ['Tatum', 'Brown', 'White', 'Holiday', 'Porziņģis', 'Horford'],
  DAL: ['Irving', 'Davis', 'Thompson', 'Gafford', 'Lively', 'Washington'],
  DEN: ['Jokić', 'Murray', 'Gordon', 'Porter Jr.', 'Braun', 'Watson'],
  CHI: ['LaVine', 'White', 'Vučević', 'Giddey', 'Williams', 'Dosunmu'],
  NYK: ['Brunson', 'Towns', 'Bridges', 'Anunoby', 'Hart', 'McBride'],
  MIA: ['Adebayo', 'Herro', 'Wiggins', 'Rozier', 'Jaquez Jr.', 'Ware'],
  OKC: ['Gilgeous-Alexander', 'Williams', 'Holmgren', 'Dort', 'Caruso', 'Wallace'],
  MIN: ['Edwards', 'Randle', 'Gobert', 'McDaniels', 'Conley', 'Reid'],
  CLE: ['Mitchell', 'Garland', 'Mobley', 'Allen', 'Strus', 'Hunter'],
  IND: ['Haliburton', 'Siakam', 'Turner', 'Nembhard', 'Mathurin', 'Toppin'],
  MIL: ['Antetokounmpo', 'Lillard', 'Lopez', 'Portis', 'Trent Jr.', 'Prince'],
  SAS: ['Wembanyama', 'Fox', 'Castle', 'Vassell', 'Johnson', 'Sochan'],
  HOU: ['Şengün', 'Green', 'VanVleet', 'Thompson', 'Brooks', 'Smith Jr.'],
  MEM: ['Morant', 'Jackson Jr.', 'Bane', 'Wells', 'Edey', 'Pippen Jr.'],
  SAC: ['Sabonis', 'DeRozan', 'LaVine', 'Murray', 'Monk', 'Ellis'],
  LAC: ['Harden', 'Leonard', 'Zubac', 'Powell', 'Dunn', 'Jones'],
  ORL: ['Banchero', 'Wagner', 'Suggs', 'Carter Jr.', 'Bitadze', 'Caldwell-Pope'],
  PHI: ['Embiid', 'Maxey', 'George', 'Oubre Jr.', 'Grimes', 'McCain'],
  ATL: ['Young', 'Johnson', 'Daniels', 'Risacher', 'Okongwu', 'Gueye'],
  TOR: ['Barnes', 'Quickley', 'Barrett', 'Ingram', 'Poeltl', 'Dick'],
  POR: ['Sharpe', 'Simons', 'Avdija', 'Ayton', 'Grant', 'Camara'],
}
const player = (abbr, r) => {
  const list = ROSTER[abbr] || ['Starter', 'Guard', 'Wing', 'Big', 'Sixth man', 'Reserve']
  // stars shoot more
  const i = Math.min(5, Math.floor(Math.pow(r(), 1.6) * 6))
  return list[i]
}

// ---------- play-by-play generator ----------
// Home shoots toward +x, away toward −x. Feet, origin at center court.
function shotFor(side, three, r) {
  const bx = side === 'home' ? 41.75 : -41.75
  const dir = side === 'home' ? -1 : 1
  let d, ang
  if (three) {
    ang = (r() - 0.5) * Math.PI * 0.9
    d = 23.75 + r() * 4
    if (Math.abs(ang) > 1.15) d = 22 + r() * 1.5 // corner three
  } else {
    const u = r()
    d = u < 0.55 ? r() * 4 : u < 0.8 ? 4 + r() * 8 : 12 + r() * 10
    ang = (r() - 0.5) * Math.PI * 0.95
  }
  let x = bx + dir * d * Math.cos(ang)
  let y = d * Math.sin(ang)
  if (Math.abs(y) > 24) y = Math.sign(y) * (22 + r() * 2)
  x = Math.max(-46.5, Math.min(46.5, x))
  return { x: +x.toFixed(1), y: +y.toFixed(1) }
}

function generatePlays(home, away, seed, { periods = 4 } = {}) {
  const r = rng(seed)
  const plays = []
  let hs = 0, as = 0, seq = 0
  let side = r() < 0.5 ? 'home' : 'away'
  const periodLen = (p) => (p <= 4 ? 720 : 300)
  const totalLen = (p) => (p <= 4 ? p * 720 : 2880 + (p - 4) * 300)

  const push = (p, secLeft, text, s, points, shot, pl) => {
    const t = totalLen(p) - secLeft
    plays.push({
      seq: ++seq, period: p, clock: clockOf(secLeft), t, text, side: s, points,
      shot, homeScore: hs, awayScore: as, wp: 0, player: pl,
    })
  }

  for (let p = 1; p <= periods; p++) {
    let secLeft = periodLen(p)
    push(p, secLeft, p === 1 ? 'Tip-off' : p <= 4 ? `Start of ${['1st', '2nd', '3rd', '4th'][p - 1]} quarter` : 'Start of overtime', null, 0, null, null)
    while (secLeft > 0) {
      const abbr = side === 'home' ? home : away
      const other = side === 'home' ? away : home
      const margin = side === 'home' ? hs - as : as - hs
      // slight rubber band keeps games watchable
      const band = Math.max(-0.08, Math.min(0.08, -margin * 0.006))
      secLeft -= 5 + Math.floor(r() * 16)
      if (secLeft < 0) secLeft = 0
      const u = r()
      const pl = player(abbr, r)
      if (u < 0.12) {
        push(p, secLeft, `${pl} turnover`, side, 0, null, pl)
        side = side === 'home' ? 'away' : 'home'
        continue
      }
      if (u < 0.22) {
        push(p, secLeft, `${player(other, r)} shooting foul`, side === 'home' ? 'away' : 'home', 0, null, null)
        const made = r() < 0.78, made2 = r() < 0.78
        const pts = (made ? 1 : 0) + (made2 ? 1 : 0)
        if (side === 'home') hs += pts; else as += pts
        push(p, secLeft, `${pl} free throws ${pts} of 2`, side, pts, null, pl)
        side = side === 'home' ? 'away' : 'home'
        continue
      }
      const three = r() < 0.4
      const made = r() < (three ? 0.355 : 0.54) + band
      const shot = { ...shotFor(side, three, r), made }
      const pts = made ? (three ? 3 : 2) : 0
      if (side === 'home') hs += pts; else as += pts
      const kind = three ? '3PT' : shot.x > 36 || shot.x < -36 ? (r() < 0.5 ? 'layup' : 'dunk') : 'jumper'
      push(p, secLeft, `${pl} ${made ? 'makes' : 'misses'} ${kind}`, side, pts, shot, pl)
      if (made) side = side === 'home' ? 'away' : 'home'
      else {
        const offReb = r() < 0.25
        secLeft = Math.max(0, secLeft - 2)
        if (!offReb) side = side === 'home' ? 'away' : 'home'
        push(p, secLeft, `${player(side === 'home' ? home : away, r)} rebound`, side, 0, null, null)
      }
    }
    if (p === periods && hs === as) periods++ // overtime
  }
  plays.push({
    seq: ++seq, period: periods, clock: '0:00', t: totalLen(periods), text: 'End of game', side: null,
    points: 0, shot: null, homeScore: hs, awayScore: as, wp: 0, player: null,
  })
  const gameLen = totalLen(periods)
  for (const p of plays) p.wp = +winProb(p.homeScore - p.awayScore, gameLen - p.t).toFixed(3)
  return plays
}

// Search seeds for a game that ends close (used for the showcase games).
function closeGame(home, away, seedBase, { maxMargin = 3, homeWins = false, closeAt = null } = {}) {
  for (let i = 0; i < 2000; i++) {
    const plays = generatePlays(home, away, seedBase + i)
    const last = plays[plays.length - 1]
    const m = last.homeScore - last.awayScore
    if (Math.abs(m) > maxMargin || last.period !== 4) continue
    if (homeWins && m <= 0) continue
    if (closeAt != null) {
      const at = plays.filter((p) => p.t <= closeAt).at(-1)
      if (Math.abs(at.homeScore - at.awayScore) > 3) continue
    }
    return plays
  }
  return generatePlays(home, away, seedBase)
}

// ---------- derived numbers ----------
function swingsOf(plays, { from = 0 } = {}) {
  const out = []
  for (let i = 1; i < plays.length; i++) {
    const p = plays[i]
    if (p.t < from || !p.side) continue
    const delta = p.wp - plays[i - 1].wp
    out.push({ seq: p.seq, text: p.text, side: p.side, delta: +delta.toFixed(3), period: p.period, clock: p.clock })
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 6)
}

function closersOf(plays) {
  const acc = {}
  for (let i = 1; i < plays.length; i++) {
    const p = plays[i]
    if (p.period < 4 || !p.player || !p.side) continue
    const d = p.wp - plays[i - 1].wp
    const key = `${p.side}|${p.player}`
    acc[key] = (acc[key] || 0) + (p.side === 'home' ? d : -d)
  }
  return Object.entries(acc)
    .map(([k, wpa]) => ({ name: k.split('|')[1], side: k.split('|')[0], wpa: +wpa.toFixed(3) }))
    .sort((a, b) => b.wpa - a.wpa)
    .slice(0, 5)
}

function dramaOf(plays) {
  const final = plays[plays.length - 1]
  const lastLen = final.t
  let churn = 0, leadChanges = 0
  for (let i = 1; i < plays.length; i++) {
    const p = plays[i]
    if (p.t > lastLen - 300) churn += Math.abs(p.wp - plays[i - 1].wp)
    const m0 = plays[i - 1].homeScore - plays[i - 1].awayScore, m1 = p.homeScore - p.awayScore
    if (p.period >= 4 && Math.sign(m0) !== Math.sign(m1) && m1 !== 0) leadChanges++
  }
  const ot = final.period > 4 ? 10 : 0
  const tight = Math.abs(final.homeScore - final.awayScore) <= 3 ? 15 : 0
  return Math.max(0, Math.min(100, Math.round(churn * 45 + leadChanges * 6 + ot + tight)))
}

const team = (abbr, score, record) => ({ abbr, nbaId: nbaId(abbr), name: teamName(abbr), score, record })

// ---------- schedule ----------
const POOL = Object.keys(ROSTER)
function scheduleFor(dateStr) {
  const r = rng(hash(dateStr))
  const n = 3 + Math.floor(r() * 5)
  const pool = [...POOL].sort(() => r() - 0.5)
  const games = []
  for (let i = 0; i < n && pool.length >= 2; i++) {
    const home = pool.pop(), away = pool.pop()
    const h = 17 + Math.floor(r() * 5), m = r() < 0.5 ? 0 : 30
    games.push({ id: `m${dateStr}${i}`, home, away, start: isoAt(dateStr, h, m), seed: hash(dateStr + home + away) })
  }
  return games
}

const recordFor = (abbr, dateStr) => {
  const r = rng(hash(abbr + dateStr))
  const w = Math.floor(r() * 7), l = Math.floor(r() * 5)
  return `${w}-${l}`
}

// ---------- the showcase day ----------
const SESSION_START = Date.now()
const LIVE_T0 = 2880 - 190 // 4th quarter, 3:10 left
const showcase = (() => {
  const today = todayStr()
  const live = closeGame('PHX', 'GSW', 4101, { maxMargin: 4, closeAt: LIVE_T0 })
  const final = closeGame('MIA', 'BOS', 9077, { maxMargin: 3, homeWins: true })
  const early = generatePlays('DEN', 'DAL', 3141)
  return { today, live, final, early }
})()

function liveCut() {
  // the live game advances in real time from 3:10 in the 4th
  const elapsed = Math.floor((Date.now() - SESSION_START) / 1000)
  return LIVE_T0 + elapsed
}

function stateFromPlays(plays, tNow) {
  const visible = plays.filter((p) => p.t <= tNow)
  const last = visible[visible.length - 1]
  const end = plays[plays.length - 1]
  if (tNow >= end.t) return { plays, last: end, done: true, period: end.period, clock: '0:00' }
  const period = last.period
  const periodEnd = period <= 4 ? period * 720 : 2880 + (period - 4) * 300
  return { plays: visible, last, done: false, period, clock: clockOf(periodEnd - tNow) }
}

function showcaseGames() {
  const d = showcase.today
  const l = stateFromPlays(showcase.live, liveCut())
  const e = stateFromPlays(showcase.early, 1680) // 3rd quarter, 8:00 left
  const f = showcase.final[showcase.final.length - 1]
  const L2M_TOTAL = 2880
  return [
    {
      id: 'live1', start: isoAt(d, 19, 0), state: l.done ? 'post' : 'in', period: l.period, clock: l.clock,
      detail: l.done ? 'Final' : `${l.period > 4 ? 'OT' : ['1st', '2nd', '3rd', '4th'][l.period - 1]} ${l.clock}`,
      home: team('PHX', l.last.homeScore, '3-1'), away: team('GSW', l.last.awayScore, '2-2'),
      closeFinish: 0.71, wp: l.last.wp,
    },
    {
      id: 'early1', start: isoAt(d, 19, 30), state: 'in', period: 3, clock: e.clock, detail: `3rd ${e.clock}`,
      home: team('DEN', e.last.homeScore, '4-0'), away: team('DAL', e.last.awayScore, '1-3'),
      closeFinish: 0.22, wp: e.last.wp,
    },
    {
      id: 'final1', start: isoAt(d, 17, 0), state: 'post', period: 4, clock: '0:00', detail: 'Final',
      home: team('MIA', f.homeScore, '2-2'), away: team('BOS', f.awayScore, '3-1'),
      closeFinish: 0.58, wp: f.homeScore > f.awayScore ? 1 : 0,
    },
    {
      id: 'pre1', start: isoAt(d, 20, 30), state: 'pre', period: 0, clock: '', detail: '',
      home: team('LAL', null, '2-2'), away: team('MIN', null, '3-1'), closeFinish: 0.47, wp: null,
    },
    {
      id: 'pre2', start: isoAt(d, 21, 0), state: 'pre', period: 0, clock: '', detail: '',
      home: team('OKC', null, '4-0'), away: team('NYK', null, '2-2'), closeFinish: 0.33, wp: null,
    },
  ].sort((a, b) => (a.state === 'in' ? 0 : a.state === 'pre' ? 1 : 2) - (b.state === 'in' ? 0 : b.state === 'pre' ? 1 : 2))
}

function scheduledGame(g, dateStr) {
  const today = showcase.today
  const past = dateStr < today
  if (!past) {
    return {
      id: g.id, start: g.start, state: 'pre', period: 0, clock: '', detail: '',
      home: team(g.home, null, recordFor(g.home, dateStr)), away: team(g.away, null, recordFor(g.away, dateStr)),
      closeFinish: +(0.2 + rng(g.seed)() * 0.6).toFixed(2), wp: null,
    }
  }
  const plays = generatePlays(g.home, g.away, g.seed)
  const f = plays[plays.length - 1]
  return {
    id: g.id, start: g.start, state: 'post', period: f.period, clock: '0:00', detail: f.period > 4 ? 'Final/OT' : 'Final',
    home: team(g.home, f.homeScore, recordFor(g.home, dateStr)), away: team(g.away, f.awayScore, recordFor(g.away, dateStr)),
    closeFinish: +(0.2 + rng(g.seed)() * 0.6).toFixed(2), wp: f.homeScore > f.awayScore ? 1 : 0,
  }
}

const L2M_FINAL_KEY = '20210106-BOS-MIA'
const L2M_FINAL_FALLBACK = [
  { period: 4, clock: '1:52', call: 'Traveling', decision: 'IC', committing: 'Tatum', disadvantaged: 'Boston', comment: 'Tatum gathers the ball and takes two steps before the dribble; the call was incorrect.', cost: -0.06 },
  { period: 4, clock: '0:41', call: 'Foul: Shooting', decision: 'INC', committing: 'Adebayo', disadvantaged: 'Brown', comment: 'Adebayo makes contact with Brown\'s arm on the drive that affects his shot attempt.', cost: 0.23 },
  { period: 4, clock: '0:09', call: 'Foul: Personal', decision: 'INC', committing: 'Herro', disadvantaged: 'White', comment: 'Herro grabs White\'s jersey while he moves to receive the inbound pass.', cost: 0.08 },
]

// ---------- real files (season + L2M) ----------
const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/'
let seasonPromise = null
let l2mPromise = null
const loadSeason = () => (seasonPromise ||= fetch(`${BASE}data/season.json`).then((r) => { if (!r.ok) throw new Error('season'); return r.json() }))
const loadL2M = () => (l2mPromise ||= fetch(`${BASE}data/l2m.json`).then((r) => { if (!r.ok) throw new Error('l2m'); return r.json() }))

// Games from the real "flipped" list get injected into their day so Season → day → game works.
async function flippedOn(dateStr) {
  try {
    const season = await loadSeason()
    return season.flipped.games.filter((g) => g.gameDate === dateStr)
  } catch { return [] }
}
const injectedId = (g) => `f${g.gameDate}${g.away}${g.home}`
function injectedGame(g) {
  const seed = hash(g.gameDate + g.away + g.home)
  return { id: injectedId(g), home: g.home, away: g.away, start: isoAt(g.gameDate, 19, 30), seed }
}

// ---------- public API ----------
const wait = (ms) => new Promise((res) => setTimeout(res, ms))

export async function getDay(dateStr) {
  await wait(120)
  if (dateStr === showcase.today) return showcaseGames()
  const extra = (await flippedOn(dateStr)).map(injectedGame)
  const sched = scheduleFor(dateStr).filter((g) => !extra.some((e) => e.home === g.home || e.away === g.away || e.home === g.away || e.away === g.home))
  return [...extra, ...sched].map((g) => scheduledGame(g, dateStr))
}

async function l2mFor(key) {
  try {
    const all = await loadL2M()
    return all[key] ?? null
  } catch { return null }
}

export async function getGame(id) {
  await wait(140)
  if (id === 'live1') {
    const s = stateFromPlays(showcase.live, liveCut())
    const game = showcaseGames().find((g) => g.id === id)
    return {
      game,
      plays: s.plays,
      swings: swingsOf(s.plays),
      closers: closersOf(s.plays),
      drama: s.done ? dramaOf(s.plays) : null,
      l2m: null,
    }
  }
  if (id === 'pre1' || id === 'pre2') {
    return { game: showcaseGames().find((g) => g.id === id), plays: [], swings: [], closers: [], drama: null, l2m: null }
  }
  if (id === 'early1') {
    const s = stateFromPlays(showcase.early, 1680)
    return { game: showcaseGames().find((g) => g.id === id), plays: s.plays, swings: swingsOf(s.plays), closers: [], drama: null, l2m: null }
  }
  if (id === 'final1') {
    const plays = showcase.final
    const l2m = (await l2mFor(L2M_FINAL_KEY)) || L2M_FINAL_FALLBACK
    return {
      game: showcaseGames().find((g) => g.id === id), plays,
      swings: swingsOf(plays), closers: closersOf(plays), drama: dramaOf(plays), l2m,
    }
  }
  const f = /^f(\d{8})([A-Z]{3})([A-Z]{3})$/.exec(id)
  if (f) {
    const [, dateStr, away, home] = f
    const g = injectedGame({ gameDate: dateStr, away, home })
    const game = scheduledGame(g, dateStr)
    const plays = generatePlays(home, away, g.seed)
    const l2m = await l2mFor(`${dateStr}-${away}-${home}`)
    return { game, plays, swings: swingsOf(plays), closers: closersOf(plays), drama: dramaOf(plays), l2m }
  }
  const m = /^m(\d{8})(\d+)$/.exec(id)
  if (m) {
    const dateStr = m[1]
    const g = scheduleFor(dateStr).find((x) => x.id === id)
    if (!g) throw new Error('Game not found')
    const game = scheduledGame(g, dateStr)
    if (game.state === 'pre') return { game, plays: [], swings: [], closers: [], drama: null, l2m: null }
    const plays = generatePlays(g.home, g.away, g.seed)
    const l2m = await l2mFor(`${dateStr}-${g.away}-${g.home}`)
    return { game, plays, swings: swingsOf(plays), closers: closersOf(plays), drama: dramaOf(plays), l2m }
  }
  throw new Error('Game not found')
}

export async function getSeason() {
  return loadSeason()
}
