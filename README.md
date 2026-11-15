# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/brendley224der/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/brendley224der/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar: every protocol that records no token yet, ranked by what its launch would be worth, each with the steps to farm it. Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## The model (radar-2)

The program reads the sealed DefiLlama snapshot (`/input/snapshot.json`, 758 protocols, 40 on the watchlist) and ranks every pre-token protocol it can see — the 40 watchlist protocols plus 138 early finds below the floor. A protocol is pre-token when its record carries no market cap, no CoinGecko id and no symbol, and it is not a wrapped, staked or bridged product of a token that already trades.

Implied value follows from the snapshot's own figures, never from a list of names:

```
implied = TVL × category multiple × (1 + growth × 0.5) × maturity × breadth
```

- **Category multiple**: the median market-cap-per-TVL of the live-token protocols in the same category (at least 3 of them), else the global median — the market's own price per dollar of TVL, clamped to [0.05, 1.50].
- **Growth**: the protocol's 7-day TVL change, clamped to [-60%, +120%].
- **Maturity**: 0.6 for a newborn protocol, rising to 1.0 after three years with no token.
- **Breadth**: +2% per extra chain, up to ten chains.

The dashboard is a static page (no network): a sortable, filterable board, a detail view for every protocol with the model's own inputs and a six-step farm plan with costs and times, a separate "Already trading" view at the market's own values, and a sandbox that re-runs the model with the reader's weights.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18 or later, standard library only. The program writes `out/board.json` (178 rows), `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. The run is deterministic: the same snapshot always writes the same bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=amsc6jjj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
