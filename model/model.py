import json, numpy as np, pandas as pd, lightgbm as lgb
from sklearn.metrics import log_loss, brier_score_loss
from sklearn.linear_model import LogisticRegression
D = "data/"
S = [2020, 2021, 2022, 2023, 2024, 2025]
K, HCA, KEEP = 20.0, 60.0, 0.75

# ---- Elo over all games in date order
games = pd.concat([pd.read_parquet(f"{D}games_{s}.parquet").assign(season=s) for s in S]).sort_values("date")
elo, season, pre = {}, None, {}
for gid, r in games.iterrows():
    if r.season != season:
        season = r.season
        elo = {t: 1500 + KEEP * (v - 1500) for t, v in elo.items()}
    h, a = elo.get(r.home, 1500), elo.get(r.away, 1500)
    pre[gid] = h - a
    e = 1 / (1 + 10 ** (-(h + HCA - a) / 400))
    mov = abs(r.fh - r.fa)
    mult = ((mov + 3) ** 0.8) / (7.5 + 0.006 * abs(h + HCA - a))   # 538-style margin multiplier
    elo[r.home] = h + K * mult * (r.home_win - e)
    elo[r.away] = a - K * mult * (r.home_win - e)
games["elo_diff"] = games.index.map(pre)
games.to_parquet(f"{D}games_all.parquet")
start = {t: round(1500 + KEEP * (v - 1500), 1) for t, v in elo.items()}
json.dump({"after_season": "2025-26", "keep": KEEP, "k": K, "hca": HCA, "ratings": start}, open(f"{D}elo.json", "w"), indent=1)
# pregame Elo accuracy (sanity)
for s in S[1:]:
    g = games[games.season == s]
    p = 1 / (1 + 10 ** (-(g.elo_diff + HCA) / 400))
    print("elo", s, "pregame acc", round(((p > .5) == g.home_win).mean(), 3), "logloss", round(log_loss(g.home_win, p), 4))

# ---- states
F = ["margin", "sec_left", "ot", "poss", "elo_diff", "z"]
def states(s):
    d = pd.read_parquet(f"{D}states_{s}.parquet", columns=["gameId", "period", "margin", "sec_left", "ot", "poss", "home_win", "elapsed"])
    d = d.join(games["elo_diff"], on="gameId")
    d = d.groupby(["gameId", "period", "sec_left"]).tail(1)
    d["z"] = (d.margin + 0.5 * d.poss) / np.sqrt(d.sec_left + 1 + 300 * d.ot)   # one state per clock tick (after all simultaneous events)
    return d
tr = pd.concat([states(s) for s in S[1:4]]); va = states(2024); te = states(2025)
print("rows", len(tr), len(va), len(te))
mono = [1, 0, 0, 1, 1, 1]
m = lgb.LGBMClassifier(n_estimators=2000, learning_rate=0.03, num_leaves=15, min_child_samples=200,
                       monotone_constraints=mono, subsample=0.8, subsample_freq=1, verbose=-1)
m.fit(tr[F], tr.home_win, eval_set=[(va[F], va.home_win)], callbacks=[lgb.early_stopping(100, verbose=False)])
print("trees", m.best_iteration_)
pt = m.predict_proba(te[F])[:, 1]
base = np.full(len(te), tr.home_win.mean())
# simple reference: margin + time only logistic
def simple(d): return np.c_[d.margin / np.sqrt(d.sec_left + 1 + 300 * d.ot), d.margin]
lr = LogisticRegression().fit(simple(tr), tr.home_win)
ps = lr.predict_proba(simple(te))[:, 1]
res = {"test_season": "2025-26", "test_games": int(te.gameId.nunique()), "test_states": len(te),
       "train_seasons": "2021-22 to 2023-24", "valid_season": "2024-25",
       "logloss": {"4th": round(log_loss(te.home_win, pt), 4), "score_and_time_only": round(log_loss(te.home_win, ps), 4), "coin_home_rate": round(log_loss(te.home_win, base), 4)},
       "brier": {"4th": round(brier_score_loss(te.home_win, pt), 4), "score_and_time_only": round(brier_score_loss(te.home_win, ps), 4)}}
# by game phase
te = te.assign(p=pt, ps=ps)
ph = {}
for name, q in [("start", te.elapsed < 60), ("half", (te.elapsed >= 1380) & (te.elapsed < 1500)), ("last 5 min", (te.sec_left <= 300) & (te.ot == 0))]:
    x = te[q]; ph[name] = {"4th": round(log_loss(x.home_win, x.p, labels=[0, 1]), 4), "score_and_time_only": round(log_loss(x.home_win, x.ps, labels=[0, 1]), 4), "n": int(len(x))}
res["by_phase"] = ph
bins = np.linspace(0, 1, 11); te["b"] = np.clip(np.digitize(te.p, bins) - 1, 0, 9)
res["calibration"] = [{"predicted": round(float(x.p.mean()), 3), "actual": round(float(x.home_win.mean()), 3), "n": int(len(x))} for _, x in te.groupby("b")]
print(json.dumps(res, indent=1))
json.dump(res, open(f"{D}wp_results.json", "w"), indent=1)
m.booster_.save_model(f"{D}wp_model.txt", num_iteration=m.best_iteration_)
json.dump(m.booster_.dump_model(num_iteration=m.best_iteration_), open(f"{D}wp_model_full.json", "w"))
