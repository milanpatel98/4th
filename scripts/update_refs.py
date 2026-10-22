"""Pull the NBA's Last Two Minute reports for recent games and price every wrong call.

Runs before each deploy and nightly (GitHub Actions). For each finished regular-season game of
2025-26 and of the current season it reads the official report (official.nba.com/l2m/json/<id>.json);
for games with an incorrect call (IC) or incorrect non-call (INC) it reads the play-by-play
(cdn.nba.com liveData) to find the score, clock and ball at that moment, then asks 4TH's win-chance
model how much the correct call would have been worth to the team it hurt.

Writes public/data/l2m.json (adds to the 2020-25 reports already there) and the "flipped" list in
public/data/season.json. Raw downloads are cached in .cache/ between runs.
"""
import json, math, re, pathlib, datetime as dt, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
CACHE = ROOT / ".cache"
M = json.loads((DATA / "model.json").read_text())
ELO = {**M["elo"]["ratings"], **(json.loads((DATA / "elo.json").read_text())["ratings"] if (DATA / "elo.json").exists() else {})}
UA = {"User-Agent": "Mozilla/5.0 (4TH fan project)", "Referer": "https://www.nba.com/", "Accept": "application/json"}
TODAY = dt.date.today()
STATS = {"missing": 0, "errors": 0}


def get(url, path, max_age_days=None):
    """Download JSON with a file cache. Missing reports are cached as null (rechecked while games are recent)."""
    p = CACHE / path
    if p.exists():
        cached = json.loads(p.read_text())
        age = (TODAY - dt.date.fromtimestamp(p.stat().st_mtime)).days
        # a missing report is rechecked after a day; a found one is kept unless it may still be updated
        if (cached is None and age < 1) or (cached is not None and (max_age_days is None or age < max_age_days)):
            return cached
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            data = None
            STATS["missing"] += 1
        else:
            STATS["errors"] += 1
            raise
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data))
    return data


# ---------- win chance (same formula as the app and the trained model) ----------
def wp(margin, ball, sec_reg, ot, elo_diff):
    c, b, poss = M["wp"]["coef"], M["wp"]["intercept"], M["wp"]["poss"]
    r = math.sqrt((max(sec_reg, 0) + 1) / 2880)
    z = c[0] * (margin + poss * ball) / r + c[1] * elo_diff * r + c[2] * r + c[3] * (1 if ot else 0) + b
    return 1 / (1 + math.exp(-z))


def clock_secs(c):
    m = re.match(r"PT(\d+)M([\d.]+)S", c or "")
    if m:
        return int(m.group(1)) * 60 + float(m.group(2))
    m = re.match(r"(\d+):([\d.]+)", c or "")
    return int(m.group(1)) * 60 + float(m.group(2)) if m else 0.0


def states(actions, home_id, away_id):
    """(period, clock seconds, margin, ball after) for each action; same possession rules as model/states.py."""
    out, ball = [], 0
    for a in sorted(actions, key=lambda a: a.get("orderNumber", a["actionNumber"])):
        tid = a.get("teamId")
        team = 1 if tid == home_id else -1 if tid == away_id else 0
        at, st = a.get("actionType", ""), str(a.get("subType", ""))
        made = a.get("shotResult") == "Made"
        missed = a.get("shotResult") == "Missed"
        k = re.match(r"^(\d) of (\d)$", st)
        last_ft = at == "freethrow" and k and k.group(1) == k.group(2)
        if at in ("2pt", "3pt") or last_ft:
            if made:
                ball = -team
            elif missed:
                ball = 0
        elif at == "turnover":
            ball = -team
        elif at in ("rebound", "steal") or (at == "jumpball" and st == "recovered"):
            ball = team
        elif at == "period":
            ball = 0
        out.append((a["period"], clock_secs(a["clock"]), int(a["scoreHome"]) - int(a["scoreAway"]), ball))
    return out


SHOOT = re.compile(r"Shooting", re.I)
TOV = re.compile(r"Turnover|Violation|Offensive|Travel|Out of Bounds|Lane|Kicked|Goaltending|Shot Clock|Double Dribble|Discontinue|Jump Ball", re.I)
NICK = {"Hawks": "ATL", "Celtics": "BOS", "Cavaliers": "CLE", "Pelicans": "NOP", "Bulls": "CHI", "Mavericks": "DAL", "Nuggets": "DEN",
        "Warriors": "GSW", "Rockets": "HOU", "Clippers": "LAC", "Lakers": "LAL", "Heat": "MIA", "Bucks": "MIL", "Timberwolves": "MIN",
        "Nets": "BKN", "Knicks": "NYK", "Magic": "ORL", "Pacers": "IND", "76ers": "PHI", "Suns": "PHX", "Trail Blazers": "POR",
        "Kings": "SAC", "Spurs": "SAS", "Thunder": "OKC", "Raptors": "TOR", "Jazz": "UTA", "Grizzlies": "MEM", "Wizards": "WAS",
        "Pistons": "DET", "Hornets": "CHA"}


def fix(s):
    return (s or "").replace("&apos;", "'").replace("&quot;", '"').replace("&amp;", "&").strip()


def priced(gid, rep):
    """Wrong calls in one report, with the win-chance cost of each (None if the game had none)."""
    g = rep["game"][0]
    wrong = [c for c in rep.get("l2m") or [] if c.get("CallRatingName") in ("IC", "INC")]
    if not wrong:
        return g, []
    pbp = get(f"https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{gid}.json", f"pbp/{gid}.json")
    if not pbp:
        return g, None
    acts = pbp["game"]["actions"]
    home, away = g["Home_team_abbr"], g["Away_team_abbr"]
    hid, aid = g["HomeTeamId"], g["AwayTeamId"]
    # player full name -> team, from the play-by-play ("F. Last" form)
    team_of = {}
    for a in acts:
        if a.get("playerNameI") and a.get("teamTricode"):
            team_of[a["playerNameI"]] = a["teamTricode"]
    def who(name):
        name = fix(name)
        if name in NICK:
            return NICK[name]
        parts = name.split(" ")
        return team_of.get(f"{parts[0][:1]}. {' '.join(parts[1:])}") if len(parts) > 1 else None
    st = states(acts, hid, aid)
    elo_diff = ELO.get(home, 1500) - ELO.get(away, 1500)
    calls = []
    for c in wrong:
        per = int(re.sub(r"\D", "", c.get("PeriodName", "Q4")) or 4)
        if c.get("PeriodName", "").startswith("OT"):
            per = 4 + per
        sec = clock_secs(c.get("PCTime"))
        before = [s for s in st if s[0] < per or (s[0] == per and s[1] >= sec)]
        dis = who(c.get("DP"))
        side = 1 if dis == home else -1 if dis == away else 0
        cost = 0.0
        pts = 1.5 if SHOOT.search(c.get("CallType", "")) else 1.0 if TOV.search(c.get("CallType", "")) else 0.8
        if before and side:
            p, s_, margin, ball = before[-1]
            sec_reg = (4 - p) * 720 + s_ if p <= 4 else s_
            now = wp(margin, ball, sec_reg, p > 4, elo_diff)
            cost = round(wp(margin + side * pts, ball, sec_reg, p > 4, elo_diff) - now, 3)
        calls.append({"period": per, "clock": f"{int(sec // 60)}:{int(sec % 60):02d}", "call": fix(c.get("CallType")),
                      "decision": c["CallRatingName"], "committing": fix(c.get("CP")), "disadvantaged": fix(c.get("DP")),
                      "team": dis, "comment": fix(c.get("Comment")), "cost": cost, "pts": pts})
    return g, calls


def season_ids(season_start_year):
    return [f"002{str(season_start_year)[2:]}{n:05d}" for n in range(1, 1231)]


def current_finals():
    sched = get("https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json", f"schedule-{TODAY}.json")
    ids = []
    for d in (sched or {}).get("leagueSchedule", {}).get("gameDates", []):
        for g in d["games"]:
            if g["gameId"].startswith("002") and g.get("gameStatus") == 3:
                ids.append(g["gameId"])
    return ids


def main():
    l2m = json.loads((DATA / "l2m.json").read_text())
    season = json.loads((DATA / "season.json").read_text())
    last = TODAY.year - 1 if TODAY.month >= 9 else TODAY.year - 2          # 2025 -> the 2025-26 season
    ids = season_ids(last) + current_finals()
    ids = list(dict.fromkeys(ids))

    def one(gid):
        try:
            rep = get(f"https://official.nba.com/l2m/json/{gid}.json", f"l2m/{gid}.json", max_age_days=None if gid.startswith(f"002{str(last)[2:]}") else 3)
            if not rep or not rep.get("game"):
                return None
            g, calls = priced(gid, rep)
            return gid, g, calls
        except Exception as e:  # one bad game shouldn't stop the rest
            print("skip", gid, e)
            return None

    with ThreadPoolExecutor(8) as ex:
        results = [r for r in ex.map(one, ids) if r]

    flipped, reports = [], 0
    for gid, g, calls in results:
        reports += 1
        if not calls:
            continue
        date = g["GameDate"][:10].replace("-", "")
        home, away = g["Home_team_abbr"], g["Away_team_abbr"]
        hs, as_ = g["HomeTeamScore"], g["VisitorTeamScore"]
        l2m[f"{date}-{away}-{home}"] = [{k: v for k, v in c.items() if k != "pts"} for c in calls]
        if gid.startswith(f"002{str(last)[2:]}") and hs != as_:
            loser = away if hs > as_ else home
            lost = sum(c["pts"] for c in calls if c["team"] == loser)
            if lost >= abs(hs - as_):
                big = max((c for c in calls if c["team"] == loser), key=lambda c: abs(c["cost"]))
                flipped.append({"gameDate": date, "home": home, "away": away, "homeScore": hs, "awayScore": as_,
                                "call": big["call"], "decision": big["decision"], "clock": big["clock"], "cost": big["cost"],
                                "winner": home if hs > as_ else away, "wronged": loser, "lostBy": abs(hs - as_), "pointsLost": round(lost, 1)})
    label = f"{last}-{str(last + 1)[2:]}"
    if any(gid.startswith(f"002{str(last)[2:]}") for gid, _, _ in results):
        flipped.sort(key=lambda x: x["gameDate"])
        season["season"] = label
        season["flipped"] = {"count": len(flipped), "games": flipped}
    (DATA / "l2m.json").write_text(json.dumps(l2m, separators=(",", ":")))
    (DATA / "season.json").write_text(json.dumps(season, separators=(",", ":")))
    status = {"run": TODAY.isoformat(), "games_checked": len(ids), "reports": reports, "flipped": len(flipped), **STATS}
    (DATA / "refs-status.json").write_text(json.dumps(status))
    print(status)


if __name__ == "__main__":
    main()
