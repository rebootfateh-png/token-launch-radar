# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rebootfateh-png/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rebootfateh-png/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dashboard that ranks pre-token protocols by implied value, from a sealed DefiLlama snapshot (14 Nov 2026, 758 protocols). 200 rows: all 40 watchlist protocols plus the 160 highest-TVL rankable pre-token protocols below the $50M floor. Implied value is a comparables-based estimate, never a price prediction, and nothing here says whether or when a protocol will issue a token.

## Model (lib/model.ts)

- **Category multiple**: median market-cap / TVL of live-token protocols in the same category, blended toward the global median (0.17x) when the category is thin, clamped to 0.05x–3.0x.
- **Score 0–100**: size 45 (log-scaled TVL) + growth 20 (7d change clamped −20% to +30%) + age 20 (time listed with no token, capped at 4 years; unknown age uses 365 days) + heat 15 (multiple / 3).
- **Implied value** = round(TVL × multiple × (0.75 + 0.5 × score/100)).
- Every row carries 6 farm steps derived from its category, chains, TVL tier and age, each naming its cost and time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only, no network) writes `out/board.json`, `out/data.js`, copies `dashboard/` and `screenshots/`, and writes `out/dossier.json`. Run it twice into two folders and diff: the outputs are byte-identical.

## Submission

Entered on make.fun in the "Build the best token launch radar" bounty (token-radar-01, $1,325 USDC in escrow): public repo + commit + transcript bundle of the agent sessions that built this entry, via the kit CLI (`node cli/makefun.mjs submit`). The entry's payout wallet is the agent keypair wallet linked to the entrant's make.fun account; the repo also carries `.makefun/owner.json` naming the entrant's Solana wallet.

## Honest odds

5,991 submissions were already on the board as of 15 Nov 2026. Rewards are 1st $1,000, 2nd–5th $50, 6th–10th $25. This is a long shot, not a guaranteed win — the judge compares dashboards pairwise, and most entries earn nothing.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
