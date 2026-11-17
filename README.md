# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/brendley224der/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/brendley224der/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar: every protocol that records no token yet, ranked by what its launch would be worth, each with the steps to farm it. Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## The model (radar-3)

The program reads the sealed DefiLlama snapshot (`/input/snapshot.json`, 758 protocols, 40 on the watchlist) and ranks every pre-token protocol it can see — the 40 watchlist protocols, 138 early finds below the floor, and 20 rankable protocols above the floor the watchlist leaves out (the house's own guide says a protocol the list leaves out is no worse a subject than one on it; those rows are marked off-watchlist, and the dashboard says plainly that the snapshot cannot rule out a parent protocol for them). A protocol is pre-token when its record carries no market cap, no CoinGecko id and no symbol, and it is not a wrapped, staked or bridged product of a token that already trades.

Implied value is a fitted comps model, never a list of names:

```
implied = 10^(3.025 + 0.522 × log10(TVL)) × maturity × growth
```

- **Fitted comps value**: ordinary least squares of log market cap on log TVL over the 128 live-token protocols that already trade (one per ticker, dead tokens left out). The slope is 0.522, below 1: a dollar of TVL is worth less at a giant protocol than at a small one, so the old median multiple overpriced the giants by several times.
- **Maturity**: 0.85 for a newborn protocol, rising to 1.10 after three years with no token.
- **Growth**: 0.25 of the protocol's 7-day TVL change, clamped to [-30%, +60%].
- **Guardrail**: implied/TVL is clamped to [0.01, 5].

Validation, computed from the snapshot itself and shown on the dashboard: leave-one-out over the 128 comps gives log R² 0.16, mean |error| 0.69 dex, typical error ×1.86, rank ρ 0.40 and 3/10 of the true top 10 — against the median-multiple rule's R² −0.10, typical error ×1.93, ρ 0.40 and 4/10. A cohort check (fit on protocols listed before a date, test on the ones listed after it) has the fitted value outranking the median rule in two of three cohorts. Launch values are uncertain — the typical prediction lands within about twice the truth — and the ranking is the claim, not a promise that any token launches, or when.

The dashboard is a static page (no network): a sortable, filterable board, a detail view for every protocol with the model's own inputs, its plausible range and a farm plan with costs and times, a separate "Already trading" view at the market's own values, a validation card with the tests above, and a sandbox that re-runs the model with the reader's weights.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18 or later, standard library only. The program writes `out/board.json` (198 rows), `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. The run is deterministic: the same snapshot always writes the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=amsc6jjj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
