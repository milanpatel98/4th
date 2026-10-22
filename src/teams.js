// NBA team ids as used by cdn.nba.com. Logos: https://cdn.nba.com/logos/nba/{id}/primary/L/logo.svg
const BASE = 1610612700

export const TEAMS = {
  ATL: { id: 37, name: 'Hawks' },
  BOS: { id: 38, name: 'Celtics' },
  CLE: { id: 39, name: 'Cavaliers' },
  NOP: { id: 40, name: 'Pelicans' },
  CHI: { id: 41, name: 'Bulls' },
  DAL: { id: 42, name: 'Mavericks' },
  DEN: { id: 43, name: 'Nuggets' },
  GSW: { id: 44, name: 'Warriors' },
  HOU: { id: 45, name: 'Rockets' },
  LAC: { id: 46, name: 'Clippers' },
  LAL: { id: 47, name: 'Lakers' },
  MIA: { id: 48, name: 'Heat' },
  MIL: { id: 49, name: 'Bucks' },
  MIN: { id: 50, name: 'Timberwolves' },
  BKN: { id: 51, name: 'Nets' },
  NYK: { id: 52, name: 'Knicks' },
  ORL: { id: 53, name: 'Magic' },
  IND: { id: 54, name: 'Pacers' },
  PHI: { id: 55, name: '76ers' },
  PHX: { id: 56, name: 'Suns' },
  POR: { id: 57, name: 'Trail Blazers' },
  SAC: { id: 58, name: 'Kings' },
  SAS: { id: 59, name: 'Spurs' },
  OKC: { id: 60, name: 'Thunder' },
  TOR: { id: 61, name: 'Raptors' },
  UTA: { id: 62, name: 'Jazz' },
  MEM: { id: 63, name: 'Grizzlies' },
  WAS: { id: 64, name: 'Wizards' },
  DET: { id: 65, name: 'Pistons' },
  CHA: { id: 66, name: 'Hornets' },
}

for (const abbr in TEAMS) TEAMS[abbr].id += BASE

export const nbaId = (abbr) => TEAMS[abbr]?.id ?? null
export const teamName = (abbr) => TEAMS[abbr]?.name ?? abbr
export const logoUrl = (id) => (id ? `https://cdn.nba.com/logos/nba/${id}/primary/L/logo.svg` : '')
