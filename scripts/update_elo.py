"""Bring team ratings up to date with this season's results (runs before every deploy, and nightly).

Starts from the ratings the model shipped with (public/data/model.json, end of 2025-26 pulled
toward the average) and replays every regular-season game since, from ESPN's public scoreboard.
Writes public/data/elo.json. If ESPN can't be reached the app falls back to the shipped ratings.
"""
import json, datetime as dt, urllib.request, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public" / "data"
M = json.loads((ROOT / "model.json").read_text())["elo"]
K, HCA = M["k"], M["hca"]
ABBR = {"GS": "GSW", "NY": "NYK", "SA": "SAS", "NO": "NOP", "UTAH": "UTA", "WSH": "WAS"}
API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={}"

def day(d):
    with urllib.request.urlopen(API.format(d.strftime("%Y%m%d")), timeout=20) as r:
        return json.load(r).get("events", [])

def main():
    elo = dict(M["ratings"])
    today = dt.date.today()
    season_start = dt.date(today.year if today.month >= 9 else today.year - 1, 10, 1)
    games, d = 0, season_start
    while d < today:
        for ev in day(d):
            if ev.get("season", {}).get("type") != 2 or ev["status"]["type"]["state"] != "post":
                continue
            c = {x["homeAway"]: x for x in ev["competitions"][0]["competitors"]}
            h, a = (ABBR.get(c[s]["team"]["abbreviation"], c[s]["team"]["abbreviation"]) for s in ("home", "away"))
            hs, as_ = int(c["home"]["score"]), int(c["away"]["score"])
            rh, ra = elo.get(h, 1500), elo.get(a, 1500)
            e = 1 / (1 + 10 ** (-(rh + HCA - ra) / 400))
            win = 1 if hs > as_ else 0
            mult = ((abs(hs - as_) + 3) ** 0.8) / (7.5 + 0.006 * abs(rh + HCA - ra))
            elo[h], elo[a] = rh + K * mult * (win - e), ra - K * mult * (win - e)
            games += 1
        d += dt.timedelta(days=1)
    out = {"through": (today - dt.timedelta(days=1)).isoformat(), "games": games, "ratings": {t: round(v, 1) for t, v in elo.items()}}
    (ROOT / "elo.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"ratings updated through {out['through']} from {games} games")

if __name__ == "__main__":
    main()
