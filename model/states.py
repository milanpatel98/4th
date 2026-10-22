"""Turn NBA live-data play-by-play CSVs into one row per action with game state."""
import sys, re, numpy as np, pandas as pd

COLS = ["gameId","actionNumber","orderNumber","clock","period","actionType","subType","personId","playerName",
        "playerNameI","x","y","possession","scoreHome","scoreAway","teamId","teamTricode","shotResult",
        "isFieldGoal","description","timeActual","descriptor","qualifiers"]

def secs(clock):
    m = clock.str.extract(r"PT(\d+)M([\d.]+)S").astype(float)
    return m[0] * 60 + m[1]

def poss_after(d):
    """Who has the ball after each play: +1 home, -1 away, 0 unknown. Same rules as the app's live feed."""
    team = np.select([d.teamId == d.home_id, d.teamId == d.away_id], [1, -1], 0)
    at, st = d.actionType.fillna(""), d.subType.fillna("")
    made = d.shotResult.eq("Made")
    last_ft = at.eq("freethrow") & st.str.match(r"^(\d) of \1$")
    out = np.full(len(d), np.nan)
    flip = (at.isin(["2pt", "3pt"]) & made) | (last_ft & made) | at.eq("turnover")
    keep = at.eq("rebound") | at.eq("steal") | (at.eq("jumpball") & st.eq("recovered"))
    out[flip.values] = -team[flip.values]
    out[keep.values] = team[keep.values]
    loose = (at.isin(["2pt", "3pt"]) & d.shotResult.eq("Missed")) | (last_ft & d.shotResult.eq("Missed"))
    out[loose.values] = 0      # missed shot: the ball is loose until someone rebounds it
    out[at.eq("period").values] = 0
    s = pd.Series(out, index=d.index).groupby(d.gameId).ffill().fillna(0)
    return s.astype(int).values

def load(season):
    d = pd.read_csv(f"data/raw/cdnnba_{season}.csv", usecols=COLS, low_memory=False)
    d = d[d.gameId.astype(str).str.startswith("2")]          # regular season only
    d = d.sort_values(["gameId","orderNumber"]).reset_index(drop=True)
    d["season"] = season
    d["clk"] = secs(d.clock.fillna("PT0M0S"))
    p = d.period
    d["sec_left"] = np.where(p <= 4, (4 - p) * 720 + d.clk, d.clk)   # regulation seconds left; OT: seconds left in OT
    d["ot"] = (p > 4).astype(int)
    d["elapsed"] = np.where(p <= 4, (p - 1) * 720 + (720 - d.clk), 2880 + (p - 5) * 300 + (300 - d.clk))
    # home team: the team whose made shots raise scoreHome
    sh = d.groupby("gameId").scoreHome.diff().fillna(0)
    sa = d.groupby("gameId").scoreAway.diff().fillna(0)
    scorer = d[(sh > 0) & (sa == 0)].groupby("gameId").teamTricode.agg(lambda s: s.mode().iat[0])
    scorer_a = d[(sa > 0) & (sh == 0)].groupby("gameId").teamTricode.agg(lambda s: s.mode().iat[0])
    tid = d.dropna(subset=["teamTricode"]).groupby(["gameId","teamTricode"]).teamId.first()
    g = pd.DataFrame({"home": scorer, "away": scorer_a}).dropna()
    g["home_id"] = [tid[(i, t)] for i, t in zip(g.index, g.home)]
    g["away_id"] = [tid[(i, t)] for i, t in zip(g.index, g.away)]
    last = d.groupby("gameId").agg(fh=("scoreHome","last"), fa=("scoreAway","last"), date=("timeActual","first"))
    g = g.join(last)
    g = g[g.fh != g.fa]
    g["home_win"] = (g.fh > g.fa).astype(int)
    d = d[d.gameId.isin(g.index)].join(g[["home","away","home_id","away_id","home_win","fh","fa"]], on="gameId")
    d["margin"] = d.scoreHome - d.scoreAway
    d["poss"] = poss_after(d)
    g["date"] = pd.to_datetime(g.date, format="ISO8601", utc=True).dt.tz_convert("America/New_York").dt.strftime("%Y%m%d")
    return d, g

if __name__ == "__main__":
    for s in map(int, sys.argv[1:]):
        d, g = load(s)
        d.to_parquet(f"data/states_{s}.parquet")
        g.to_parquet(f"data/games_{s}.parquet")
        print(s, len(g), "games", len(d), "actions", g.home_win.mean().round(3))
