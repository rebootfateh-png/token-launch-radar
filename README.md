# Token Radar — make.fun bounty token-radar-01

A dashboard that ranks pre-token protocols by implied value, from a sealed
DefiLlama snapshot (14 Nov 2026, 758 protocols). 200 rows: all 40 watchlist
protocols plus the 160 highest-TVL rankable pre-token protocols below the
$50M floor. Implied value is a comparables-based estimate, never a price
prediction, and nothing here says whether or when a protocol will issue a
token.

## Model (lib/model.ts)

- **Category multiple**: median market-cap / TVL of live-token protocols in
  the same category, blended toward the global median (0.17x) when the
  category is thin, clamped to 0.05x–3.0x.
- **Score 0–100**: size 45 (log-scaled TVL) + growth 20 (7d change clamped
  −20% to +30%) + age 20 (time listed with no token, capped at 4 years;
  unknown age uses 365 days) + heat 15 (multiple / 3).
- **Implied value** = round(TVL × multiple × (0.75 + 0.5 × score/100)).
- Every row carries 6 farm steps derived from its category, chains, TVL
  tier and age, each naming its cost and time.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only, no network) writes
`out/board.json`, `out/data.js`, copies `dashboard/` and `screenshots/`,
and writes `out/dossier.json`. Run it twice into two folders and diff:
the outputs are byte-identical.

## How Khan submits it (not done yet — this entry is NOT submitted)

1. **Make a Solana wallet** (his own keypair, never shared):
   `node -e "…"` as in the kit RULES.txt, or solana-keygen. Keep
   `wallet.json` private (chmod 600).
2. **Sign in at make.fun** with that wallet:
   `node cli/makefun.mjs register --keypair wallet.json --origin https://make.fun`
   (or `login` if he already has an account).
3. **Bundle the transcripts** of the agent sessions that built this entry
   (the kit's `bundle` command) — the transcript gate needs them, and a
   source-bundle entry needs the kit `init` anchor. See RULES.txt
   "Before you submit" and "Enter".
4. **Submit either way**:
   - GitHub: create a public repo **after 14 Nov 2026 10:00 UTC**, push
     this entry, add `.makefun/owner.json` with his wallet address (unless
     the repo owner is his GitHub login), then submit the repo + commit.
   - Source bundle: run the kit's `init` in an empty repo first, copy
     this entry in, then submit the bundle.
5. **Check first**: `node cli/makefun.mjs check --kit . --repo <repo> --transcripts transcripts.tar.gz`

## Honest odds

5,991 submissions were already on the board as of 15 Nov 2026. Rewards are
1st $1,000, 2nd–5th $50, 6th–10th $25. This is a long shot, not a guaranteed
win — the judge compares dashboards pairwise, and most entries earn nothing.
