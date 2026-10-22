"""Fit the shipped models and build the season data the app reads."""
import json, re, numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, brier_score_loss
D = "data/"; OUT = "public/data/"
import os; os.makedirs(OUT, exist_ok=True)
games = pd.read_parquet(D + "games_all.parquet")
elo = json.load(open(D + "elo.json"))
HCA = elo["hca"]
POSS = 0.55   # half of the ~1.1 points a possession is worth: having the ball vs. the other team having it is ~1.1

def feats(d):
    t = np.where(d.ot == 1, d.sec_left + 1, d.sec_left + 1)
    r = np.sqrt(t / 2880)
    return np.c_[(d.margin + POSS * d.poss) / r, d.elo_diff * r, r, d.ot]

def load(s, dedupe=True):
    d = pd.read_parquet(f"{D}states_{s}.parquet").join(games["elo_diff"], on="gameId")
    return d.groupby(["gameId", "period", "sec_left"]).tail(1) if dedupe else d

# ---- win chance
tr = pd.concat([load(s) for s in [2021, 2022, 2023, 2024]]); te = load(2025)
wp = LogisticRegression(C=10, max_iter=3000).fit(feats(tr), tr.home_win)
p = wp.predict_proba(feats(te))[:, 1]
te = te.assign(p=p)
res = {"train": "2021-22 to 2024-25", "test": "2025-26", "test_games": int(te.gameId.nunique()),
       "logloss": round(log_loss(te.home_win, p), 4), "brier": round(brier_score_loss(te.home_win, p), 4)}
bins = np.clip((te.p * 10).astype(int), 0, 9)
res["calibration"] = [{"predicted": round(float(x.p.mean()), 3), "actual": round(float(x.home_win.mean()), 3), "n": int(len(x))} for _, x in te.groupby(bins)]
late = te[(te.sec_left <= 300) & (te.ot == 0)]
res["last5_logloss"] = round(log_loss(late.home_win, late.p), 4)
res["pick_accuracy_at_half"] = round(float(((te[(te.period == 3) & (te.sec_left == 1440)].p > .5) == te[(te.period == 3) & (te.sec_left == 1440)].home_win).mean()), 3)

# ---- close finish: |margin| <= 5 with 2:00 left in the 4th
def at2(s):
    d = pd.read_parquet(f"{D}states_{s}.parquet", columns=["gameId", "period", "sec_left", "margin"])
    d = d[(d.period == 4) & (d.sec_left >= 120)].groupby("gameId").tail(1)
    return d.set_index("gameId").join(games[["elo_diff"]])
def cf_x(d): return np.c_[np.abs(d.elo_diff + HCA)]
ctr = pd.concat([at2(s) for s in [2021, 2022, 2023, 2024]]); cte = at2(2025)
cf = LogisticRegression().fit(cf_x(ctr), (ctr.margin.abs() <= 5).astype(int))
cp = cf.predict_proba(cf_x(cte))[:, 1]; cy = (cte.margin.abs() <= 5).astype(int)
res["close_finish"] = {"base_rate": round(float(cy.mean()), 3), "brier": round(brier_score_loss(cy, cp), 4),
                       "brier_base_rate": round(brier_score_loss(cy, np.full(len(cy), ctr.margin.abs().le(5).mean())), 4),
                       "range": [round(float(cp.min()), 3), round(float(cp.max()), 3)]}

# ---- per-action win chance for a season (for WPA and wrong-call costs)
def actions(s):
    d = load(s, dedupe=False).copy()
    d["wp"] = wp.predict_proba(feats(d))[:, 1]
    end = (d.period >= 4) & (d.clk == 0) & (d.margin != 0) & (d.actionType == "period") & (d.subType == "end")
    d.loc[end, "wp"] = (d.margin[end] > 0).astype(float)
    # the play's own effect: win chance after it minus win chance with the old score and ball at the same moment,
    # so the clock running down is credited to no one
    prev = d.groupby("gameId")[["margin", "poss"]].shift().fillna(0)
    b = d.copy(); b["margin"] = prev.margin; b["poss"] = prev.poss
    d["wp_before"] = wp.predict_proba(feats(b))[:, 1]
    d["dwp"] = d.wp - d.wp_before
    d["dwp_all"] = d.groupby("gameId").wp.diff().fillna(0)
    return d

# excitement (sum |dwp|) -> drama 0..100 percentile table, from 2025-26
a25 = actions(2025)
exc = a25.groupby("gameId").dwp_all.apply(lambda x: x.abs().sum())
q = [round(float(v), 3) for v in np.quantile(exc, np.linspace(0, 1, 101))]

# ---- clutch: win chance added in the 4th and OT, 2025-26
c = a25[(a25.period >= 4) & a25.personId.gt(0) & a25.teamTricode.notna()].copy()
c["side"] = np.where(c.teamTricode == c.home, 1, -1)
c["wpa"] = c.dwp * c.side
# a rebound is credited against a "loose ball" worth 0, which overpays rebounders; centre rebounds on their average
REB = c.loc[c.actionType == "rebound"].groupby("subType").wpa.mean().round(4).to_dict()
c.loc[c.actionType == "rebound", "wpa"] -= c.loc[c.actionType == "rebound", "subType"].map(REB)
cl = c.groupby(["personId"]).agg(name=("playerName", "last"), first=("playerNameI", "last"), team=("teamTricode", "last"),
                                 wpa=("wpa", "sum"), games=("gameId", "nunique")).sort_values("wpa", ascending=False)
# full names from descriptions are initials; keep "F. Last" form
print("league total wpa", round(float(c.wpa.sum()), 2), "players", len(cl))
clutch = [{"name": r.first, "team": r.team, "wpa": round(float(r.wpa), 3), "games": int(r.games)} for _, r in cl.head(10).iterrows()]

# ---- referees: last two minute wrong calls, 2020-21 .. 2024-25
L = pd.read_csv(D + "L2M_stats_nba.csv", low_memory=False)
L = L[L.decision.isin(["IC", "INC"])].copy()
L["gid"] = pd.to_numeric(L.gid, errors="coerce")
L["per"] = L.period.str.extract(r"(\d)").astype(float)
L["sec"] = pd.to_numeric(L.time_min, errors="coerce") * 60 + pd.to_numeric(L.time_sec, errors="coerce")
SHOOT = L.call_type.fillna("").str.contains("Shooting", case=False)
TOV = L.call_type.fillna("").str.contains("Turnover|Violation|Offensive|Travel|Out of Bounds|Lane|Kicked|Goaltending|Shot Clock|Double Dribble|Discontinue|Jump Ball", case=False)
L["pts"] = np.select([SHOOT, TOV], [1.5, 1.0], 0.8)    # expected points the wronged team lost (see README)
l2m, flipped = {}, []
for s in [2020, 2021, 2022, 2023, 2024]:
    d = actions(s)
    g = games[games.season == s]
    Ls = L[L.gid.isin(g.index)]
    d = d.sort_values(["gameId", "orderNumber"])
    for gid, rows in Ls.groupby("gid"):
        gm = g.loc[gid]; da = d[d.gameId == gid]
        key = f"{gm.date}-{gm.away}-{gm.home}"
        calls, wronged_pts = [], {}
        for _, r in rows.sort_values(["per", "sec"], ascending=[True, False]).iterrows():
            st = da[(da.period < r.per) | ((da.period == r.per) & (da.clk >= r.sec))]
            if st.empty or np.isnan(r.sec): continue
            st = st.iloc[-1]
            dis = r.disadvantaged_team if isinstance(r.disadvantaged_team, str) else None
            side = 1 if dis == gm.home else (-1 if dis == gm.away else 0)
            cost = 0.0
            if side:
                s2 = st.copy(); s2.margin = st.margin + side * r.pts
                p2 = wp.predict_proba(feats(pd.DataFrame([s2])))[:, 1][0]
                cost = round(float(p2 - st.wp), 3)        # home win chance the correct call would have added
                wronged_pts[dis] = wronged_pts.get(dis, 0) + r.pts
            calls.append({"period": int(r.per), "clock": f"{int(r.sec // 60)}:{int(r.sec % 60):02d}", "call": str(r.call_type),
                          "decision": r.decision, "committing": r.committing if isinstance(r.committing, str) else "",
                          "disadvantaged": r.disadvantaged if isinstance(r.disadvantaged, str) else "",
                          "team": dis, "comment": str(r.comments) if isinstance(r.comments, str) else "", "cost": cost})
        if not calls: continue
        l2m[key] = calls
        loser = gm.away if gm.home_win else gm.home
        lost_by = abs(gm.fh - gm.fa)
        if s == 2024 and wronged_pts.get(loser, 0) >= lost_by:
            big = max((c for c in calls if c["team"] == loser), key=lambda c: abs(c["cost"]))
            flipped.append({"gameDate": gm.date, "home": gm.home, "away": gm.away, "homeScore": int(gm.fh), "awayScore": int(gm.fa),
                            "call": big["call"], "decision": big["decision"], "clock": big["clock"], "cost": big["cost"],
                            "winner": gm.home if gm.home_win else gm.away, "wronged": loser,
                            "lostBy": int(lost_by), "pointsLost": round(wronged_pts[loser], 1)})
flipped.sort(key=lambda x: x["gameDate"])
res["referees_2024_25"] = {"games_with_report": int(sum(1 for k in l2m if k[:4] in ("2024", "2025") and k >= "20241001")),
                           "wrong_calls": int(sum(len(v) for k, v in l2m.items() if k >= "20241001")), "flipped": len(flipped)}

model = {"wp": {"coef": [round(float(x), 6) for x in wp.coef_[0]], "intercept": round(float(wp.intercept_[0]), 6),
                "poss": POSS, "features": ["(margin+poss*ball)/r", "elo_diff*r", "r", "ot"], "r": "sqrt((seconds left in regulation, or in OT if OT, +1)/2880)"},
         "close": {"coef": round(float(cf.coef_[0][0]), 6), "intercept": round(float(cf.intercept_[0]), 6), "x": "abs(elo_diff + hca)"},
         "drama": q, "rebound_mean": {k: v for k, v in REB.items() if k in ("offensive", "defensive")}, "elo": elo}
json.dump(model, open(OUT + "model.json", "w"), separators=(",", ":"))
json.dump({"season": "2024-25", "clutchSeason": "2025-26", "flipped": {"count": len(flipped), "games": flipped}, "clutch": clutch},
          open(OUT + "season.json", "w"), separators=(",", ":"))
json.dump(l2m, open(OUT + "l2m.json", "w"), separators=(",", ":"))
json.dump(res, open("model/results.json", "w"), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != "calibration"}, indent=1)); print(clutch[:5]); print(len(l2m), "l2m games")
