// Live feed for 4TH: ESPN's public NBA scoreboard and game summary (both allow browser requests),
// turned into the shapes the screens use, with win chance from 4TH's own model (public/data/model.json).
import { nbaId, teamName } from './teams.js'

const API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const DATA = `${import.meta.env.BASE_URL}data/`

// ESPN abbreviations that differ from the NBA's
const ABBR = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS', PHO: 'PHX', BRK: 'BKN', CHO: 'CHA' }
const abbr = (a) => ABBR[a] || a

const once = (f) => { let p; return () => (p ||= f().catch((e) => { p = null; throw e })) }
const json = async (url, opts) => {
  const r = await fetch(url, opts)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}
const loadModel = once(() => json(`${DATA}model.json`))
const loadElo = once(() => json(`${DATA}elo.json`).catch(() => null))
const loadSeason = once(() => json(`${DATA}season.json`))
const loadL2M = once(() => json(`${DATA}l2m.json`))

// ---------- model ----------
const sigmoid = (z) => 1 / (1 + Math.exp(-z))

async function ratings() {
  const [m, live] = await Promise.all([loadModel(), loadElo()])
  return { ...m.elo.ratings, ...(live?.ratings || {}) }
}

// Home win chance. secReg: seconds left in regulation, or in the current OT period.
export function winChance(m, { margin, ball, secReg, ot, eloDiff }) {
  const { coef, intercept, poss } = m.wp
  const r = Math.sqrt((Math.max(secReg, 0) + 1) / 2880)
  return sigmoid(coef[0] * (margin + poss * ball) / r + coef[1] * eloDiff * r + coef[2] * r + coef[3] * (ot ? 1 : 0) + intercept)
}

const closeFinish = (m, eloDiff) => sigmoid(m.close.coef * Math.abs(eloDiff + m.elo.hca) + m.close.intercept)

const dramaOf = (m, excitement) => {
  const q = m.drama
  let i = 0
  while (i < q.length - 1 && q[i + 1] <= excitement) i++
  return Math.round(i)
}

// ---------- clocks ----------
const pad = (n) => String(n).padStart(2, '0')
function clockSecs(c) {
  const s = String(c ?? '0')
  if (s.includes(':')) { const [mm, ss] = s.split(':'); return +mm * 60 + parseFloat(ss) }
  return parseFloat(s) || 0
}
const clockText = (sec) => `${Math.floor(sec / 60)}:${pad(Math.floor(sec % 60))}`
const secReg = (period, sec) => (period <= 4 ? (4 - period) * 720 + sec : sec)
const elapsed = (period, sec) => (period <= 4 ? (period - 1) * 720 + (720 - sec) : 2880 + (period - 5) * 300 + (300 - sec))

// The ET calendar day a game belongs to (what the NBA and the referee reports use)
const etDay = (iso) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  return p.replaceAll('-', '')
}

// ---------- games ----------
function teamOf(c, state) {
  const a = abbr(c.team.abbreviation)
  const rec = (c.records || c.record || []).find((r) => r.type === 'total' || r.name === 'overall' || r.name === 'All Splits') || (c.records || c.record || [])[0]
  return {
    abbr: a, nbaId: nbaId(a), name: teamName(a) || c.team.shortDisplayName,
    score: state === 'pre' || c.score == null || c.score === '' ? null : Number(c.score),
    record: rec?.summary ?? null,
  }
}

function gameOf(ev, m, elo) {
  const comp = ev.competitions[0]
  const st = comp.status || ev.status
  const state = st.type.state
  const home = teamOf(comp.competitors.find((c) => c.homeAway === 'home'), state)
  const away = teamOf(comp.competitors.find((c) => c.homeAway === 'away'), state)
  const eloDiff = (elo[home.abbr] ?? 1500) - (elo[away.abbr] ?? 1500)
  const period = st.period || 0
  const sec = clockSecs(st.displayClock)
  let wp = null
  if (state === 'post') wp = home.score > away.score ? 1 : 0
  else if (state === 'in') wp = winChance(m, { margin: home.score - away.score, ball: 0, secReg: secReg(Math.max(period, 1), sec), ot: period > 4, eloDiff })
  else wp = winChance(m, { margin: 0, ball: 0, secReg: 2880, ot: false, eloDiff })
  return {
    id: ev.id, start: ev.date || comp.date, state, period,
    clock: state === 'in' ? clockText(sec) : '',
    detail: st.type.shortDetail || st.type.detail || '',
    home, away,
    closeFinish: closeFinish(m, eloDiff),
    wp,
    eloDiff,
    day: etDay(ev.date || comp.date),
  }
}

export async function getDay(dateStr) {
  const [sb, m, elo] = await Promise.all([json(`${API}/scoreboard?dates=${dateStr}`, { cache: 'no-store' }), loadModel(), ratings()])
  return (sb.events || []).map((ev) => gameOf(ev, m, elo))
}

// ---------- one game ----------
const FT = /Free Throw/i
const TURNOVER = /Turnover|Traveling|Shot Clock|Double Dribble|Backcourt|Palming|Offensive Goaltending|Discontinued Dribble|Carrying/i
const lastName = (full = '') => full.split(' ').slice(1).join(' ') || full

// "Nickeil Alexander-Walker makes 27-foot three point step back jumpshot (Jalen Johnson assists)" -> "makes 3PT"
function shortText(raw, type) {
  const t = raw.replace(/\(.*?\)/g, '').toLowerCase()
  const verb = /\bmakes\b/.test(t) ? 'makes' : /\bmisses\b/.test(t) ? 'misses' : null
  if (verb) {
    const kind = /free throw/.test(t) ? 'free throw' : /three point/.test(t) ? '3PT' : /alley oop/.test(t) ? 'alley-oop'
      : /dunk/.test(t) ? 'dunk' : /layup|finger roll/.test(t) ? 'layup' : /hook/.test(t) ? 'hook' : /tip/.test(t) ? 'tip-in' : 'jumper'
    return `${verb} ${kind}`
  }
  if (/rebound/i.test(type)) return 'rebound'
  if (TURNOVER.test(type) || /turnover/.test(t)) return /steal/.test(raw.toLowerCase()) ? 'turnover, stolen' : 'turnover'
  if (/foul/i.test(type)) return /shooting/i.test(type) ? 'shooting foul' : 'foul'
  if (/timeout/i.test(type)) return 'timeout'
  return raw.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()
}

export async function getGame(id) {
  const [s, m, elo] = await Promise.all([json(`${API}/summary?event=${id}`, { cache: 'no-store' }), loadModel(), ratings()])
  const comp = s.header.competitions[0]
  const ev = { id, date: comp.date, competitions: [comp] }
  const game = gameOf(ev, m, elo)
  const homeId = comp.competitors.find((c) => c.homeAway === 'home').id
  const sideOf = (teamId) => (teamId == null ? null : String(teamId) === String(homeId) ? 'home' : 'away')

  // player names
  const names = {}
  for (const t of s.boxscore?.players || []) {
    for (const st of t.statistics || []) for (const a of st.athletes || []) names[a.athlete.id] = a.athlete.displayName
  }

  const plays = []
  let ball = 0, prevMargin = 0, prevBall = 0, excitement = 0
  const credit = {}
  for (const p of s.plays || []) {
    const period = p.period?.number || 1
    const sec = clockSecs(p.clock?.displayValue)
    const side = sideOf(p.team?.id)
    const sgn = side === 'home' ? 1 : side === 'away' ? -1 : 0
    const type = p.type?.text || ''
    const ft = FT.test(type)
    const made = !!p.scoringPlay
    let rebound = null
    // who has the ball after this play (same rules the model was trained with)
    if (p.shootingPlay && !ft) ball = made ? -sgn : 0
    else if (ft) {
      const k = /(\d) of (\d)/.exec(type)
      if (k && k[1] === k[2]) ball = made ? -sgn : 0
    } else if (/Rebound/i.test(type)) { ball = sgn; rebound = /Offensive/i.test(type) ? 'offensive' : 'defensive' }
    else if (TURNOVER.test(type)) ball = -sgn
    else if (/Jump ?ball/i.test(type) && sgn) ball = sgn
    else if (/End Period|End of|End Game/i.test(type)) ball = 0

    const homeScore = p.homeScore ?? 0, awayScore = p.awayScore ?? 0
    const margin = homeScore - awayScore
    const base = { secReg: secReg(period, sec), ot: period > 4, eloDiff: game.eloDiff }
    let wp = winChance(m, { ...base, margin, ball })
    const over = (period >= 4 && sec === 0 && /End/i.test(type) && margin !== 0)
    if (over) wp = margin > 0 ? 1 : 0

    // shot location: ESPN gives feet across the court (0-50) and from the basket; home shoots at +x
    let shot = null
    const c = p.coordinate
    if (p.shootingPlay && !ft && c && c.x >= 0 && c.x <= 50 && c.y >= -6 && c.y <= 94 && sgn) {
      shot = sgn > 0 ? { x: 41.75 - c.y, y: c.x - 25, made } : { x: -41.75 + c.y, y: 25 - c.x, made }
    }

    const pid = p.participants?.[0]?.athlete?.id
    const full = names[pid] || ''
    const player = full ? lastName(full) : null
    const raw = (p.text || type).replace(/\n/g, ' ')
    const text = player ? `${player} ${shortText(raw, type)}` : shortText(raw, type)

    // the play's own effect on win chance, for "who closed it" (clock running down is credited to no one)
    if (period >= 4 && player && sgn) {
      const before = winChance(m, { ...base, margin: prevMargin, ball: prevBall })
      let eff = (wp - before) * sgn
      if (rebound) eff -= m.rebound_mean?.[rebound] ?? 0
      const key = `${side}|${player}`
      credit[key] = (credit[key] || 0) + eff
    }
    if (plays.length) excitement += Math.abs(wp - plays[plays.length - 1].wp)

    plays.push({
      seq: Number(p.sequenceNumber) || plays.length, period, clock: clockText(sec), t: elapsed(period, sec), text, side,
      points: made ? p.scoreValue || 0 : 0, shot, homeScore, awayScore, wp, player,
    })
    prevMargin = margin; prevBall = ball
  }
  if (game.state === 'post' && plays.length) plays[plays.length - 1].wp = game.wp
  if (game.state === 'in' && plays.length) game.wp = plays[plays.length - 1].wp

  const swings = []
  for (let i = 1; i < plays.length; i++) {
    const p = plays[i]
    if (!p.side) continue
    swings.push({ seq: p.seq, text: p.text, player: p.player, side: p.side, delta: p.wp - plays[i - 1].wp, period: p.period, clock: p.clock })
  }
  swings.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  const closers = Object.entries(credit)
    .map(([k, wpa]) => ({ name: k.split('|')[1], side: k.split('|')[0], wpa }))
    .sort((a, b) => b.wpa - a.wpa)
    .slice(0, 5)

  let l2m = null
  if (game.state === 'post') {
    try { l2m = (await loadL2M())[`${game.day}-${game.away.abbr}-${game.home.abbr}`] ?? null } catch { l2m = null }
  }

  return {
    game, plays,
    swings: swings.slice(0, 6),
    closers: game.period >= 4 || game.state === 'post' ? closers : [],
    drama: game.state === 'post' ? dramaOf(m, excitement) : null,
    l2m,
  }
}

export async function getSeason() {
  return loadSeason()
}
