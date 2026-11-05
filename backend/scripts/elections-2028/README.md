# National election markets (2027–2036)

The headline markets the 2028+ elections page needs, owned by
@ManifoldPolitics: nominees and running mates, the popular vote, electoral
votes, the tipping point, a balance-of-power market (presidency, Senate and
House, all eight combinations) for every cycle through 2036, a 2028
presidential primary for each party in every state and DC, and the 2027
off-year races. 127 markets (25 national + 102 state primaries), Ṁ391,300
at the answer counts of 5 Nov 2026. A market's
cost is the larger of its tier and its answers × the tier's per-answer
price (Ṁ100 at the Ṁ1,000 tier, Ṁ1,000 at Ṁ10,000), "Other" included: the
2028 nominee markets cost Ṁ13k and Ṁ11k with that day's 12 and 10 people at
≥ 1%. Run `--online` for the exact figures before an apply.

Liquidity (Tod, 5 Nov 2026): the Ṁ10,000 tier for every 2028 presidential
market (nominees, running mates, VP winner, popular vote, electoral votes,
margin, the popular-vote-winner-loses market, tipping point, contested
conventions, and the first four states' primaries), the 2032 winner, and
the five balance-of-power markets: 26 markets, Ṁ290k. The other 101 (the
2027 races, the 2032 nominees, the other 94 state primaries) stay at
Ṁ1,000.

Balance of power (Tod, 5 Nov 2026: "do balance of power markets instead [of
control of Congress], mimicking" JonasVollmer's 2026 market): eight fixed
answers, "D President, D Senate, D House (Democratic trifecta)" through
"R President, D Senate, R House". Midterm markets ask about the President in
office when the new Congress organizes. Opening odds come from a Gaussian
copula on P(Democrat) for the three offices (2028: 67% / 74.4% / 60%, from
the community party and Senate markets and the House prior), correlation 0.6
in presidential years; in midterms the presidency pulls against Congress
(-0.2 Senate, -0.3 House) while the chambers move together (0.6).

## Answers

| Mode | Markets | Who adds answers |
|---|---|---|
| fixed (`DISABLED`) | buckets, balance of power, Virginia chambers | Nobody; no "Other" |
| curated (`ONLY_CREATOR`) | nominees, running mates, VP winner, tipping point, 2032 winner; party markets (2027 governors, 2028 popular vote) | @ManifoldPolitics, with an "Other" answer. Party markets open as Democratic Party / Republican Party / Other; @ManifoldPolitics can add another party or an independent if one becomes competitive |
| open (`ANYONE`) | the 102 state primaries | Anyone, with an "Other" answer. They open with the three likeliest candidates (Tod, 5 Nov 2026: "seed it with maybe 2-3 likely people and open answer 'other' option") |

Balance-of-power and Virginia chamber markets have no "Other": independents
count with the party they caucus with, so control can't go to anyone else.

Per-state presidential, Senate-seat, governor and House-district markets are
**not** here: the generic party-market pipeline on branch
`elections-2028-2036` covers those. @ManifoldPolitics already owns the 2028
winner market (`t9s0m8tf2v`), so there is no new one.

## Scope

Together with the pipeline (1,031 race markets), this is 1,158 markets,
about Ṁ2.88M at 5 Nov 2026 answer counts. They cover the regular federal and
governor elections of 2027–2036, not every US election:

- **In:** the 2027 Kentucky, Mississippi and Louisiana governor races and
  Virginia's legislature; 2028 nominees, running mates, VP winner, popular
  vote, electoral votes, margin, tipping point, contested conventions, and
  each party's primary in every state and DC; presidential markets by state
  (electoral votes and popular vote) and by Maine/Nebraska district for 2028,
  2032 and 2036; Senate and governor races every cycle 2028–2036; House races
  in 2028; balance of power every cycle; the 2032 nominees and winner.
- **Not yet:** House races after 2028, special elections, off-year races
  after 2027 (2029 Virginia and New Jersey governors and later), the
  territories' and Democrats Abroad's presidential contests, 2032 and 2036
  primaries, and state legislatures other than Virginia's. These are on the
  additions list in Notion ("Elections 2028+: additions list"), with when
  each should be created.
- **Reapportionment:** the 2028 House map keeps the 2020 apportionment, so
  all 435 districts exist (each market follows its district number). After
  the 2030 census, recheck Maine's and Nebraska's district counts before the
  2032 and 2036 district markets matter: a district that disappears resolves
  N/A by its wording, but a new one (a Nebraska 4th, say) needs a new market,
  as does any state that switches to awarding electors by district.

## Resolution conventions

- Primaries: certified state or party results, or an AP call once the
  outcome is settled; caucuses and ranked-choice contests count final-round
  votes. "Uncommitted" resolves to its own answer if someone adds it,
  otherwise to Other.
- National popular vote (winner, margin, and the popular-vote winner losing):
  certified first-preference totals from the 50 states and DC. The pipeline's
  state popular-vote markets follow each state's certified winner instead,
  final ranked-choice round included.
- Tipping point: states ranked by the winner's signed margin over the
  candidate with the second-most electoral votes; only electoral votes
  awarded to the winner add up; Maine and Nebraska count as a two-vote
  statewide unit plus their districts.
- Balance of power: in presidential years a 50–50 Senate goes to the party of
  the Vice President inaugurated on January 20; N/A if no listed combination
  applies (a third-party President or Speaker, say).

| File | What |
|---|---|
| `national-markets.ts` | The manifest (`ENTRIES`, series `us-national-2028-v1`), resolution criteria, validation, seed resolution, payloads, price verification |
| `seeds.ts` | Pure seed math: name normalization, copying a community market, derived VP odds, normal-distribution buckets, state-primary flattening with home-state boosts, reserved ids |
| `photos.ts` | Candidate photo lookup for answer images (reads the web candidate registry and `credits.json` as text; backend code can't import web) |
| `api.ts` | Paced, retrying API client; writes refuse to run in dry runs |
| `create-national-markets.ts` | The CLI |
| `national-markets.test.ts` | node:test suite |
| `out/` | Dry-run output: `plan.json`, `online.json`, `report.md` |

## How it stays quiet

@ManifoldPolitics has ~23k followers. Follower notifications only fire when a
market is created **public** (`createNewContractNotification` checks
`contract.visibility == 'public'`), and publishing later through
`POST /v0/market/:id/update` only revalidates, logs an analytics event and
records an edit (`update-market.ts`; no notification code on that path). The
live "new market" broadcast is skipped for unlisted markets too. So every
market is created **unlisted**, read back, its opening odds checked against
the seed (within 1.5 points), and only then published. `--loud` skips this;
don't use it. (Rechecked 5 Nov 2026. New-market emails to followers are also
off for @ManifoldPolitics, via `NO_NEW_MARKET_EMAIL_CREATOR_IDS`.)

One notification ignores visibility: an @mention in a description notifies
the mentioned user. No description mentions anyone (a test enforces it).

## How it stays safe to re-run

- Each market has a reserved id: `sha256(series + key)` → 10 characters of the
  `randomStringRegex` alphabet, sent as `idempotencyKey`. The API uses it as
  the contract id and refuses a second create with the same key, so a retry
  after a timeout can't make a duplicate.
- The state file records every step per key: `creating` → `created-unlisted`
  → `verified` → `published` (or `stopped` with the reason). Re-running skips
  published markets and resumes the rest. It must live outside any git
  working tree.
- The seed used is stored before the create call, so a market whose create
  outcome was unclear is verified against the odds it was actually created
  with.
- Reads of the target market are cache-busted (market reads are CDN-cached
  for up to ~15 s, and a stale 404 must not look like "missing").
- A run stops on anything unexpected: a seed error, a reserved id held by a
  different market, opening prices off by more than 1.5 points, a market that
  exists without a recorded seed, a rejected create. Fix the cause, then edit
  or delete that key's record in the state file and re-run.
- `--max-mana` caps what one run may spend; the run also stops when the
  balance is short.
- One run per state file: apply takes `<state>.lock` (created exclusively)
  before reading the state file and removes it at the end. A crash leaves it
  behind on purpose; delete it once you're sure no run is active.
- The criteria each market was created with (question, description, answer
  mode, fixed answers, close time, topics, tier) are saved with a hash. A
  market created under different criteria than the manifest's now is never
  verified or published: the run stops and names what changed. Edit the
  unlisted market on the site to match, then re-run with
  `--accept-criteria <key>` (exact keys, comma-separated); the run checks the
  market's question and description on the site against the manifest before
  accepting. Or delete the market and its record. Already-published markets
  only get a warning.
- A market found at its reserved id that this run didn't create (the read
  before creating missed it) is not adopted blind: the run stops, since the
  criteria it was made with aren't known. A resumed market keeps the
  visibility it was created with, so an unlisted one always gets published.
- When the budget or balance runs out, the run creates nothing more but
  still verifies and publishes markets earlier runs created.
- Before every create, the run checks @ManifoldPolitics' open public markets
  (refreshed every 5 minutes) for one asking the same question: same years,
  same party/office/kind-of-count words, same states (names or postal codes),
  similar wording, with shorthand like "Dem", "VP pick" and "gubernatorial"
  read as the full word. The reserved ids stop this script repeating itself;
  this stops it repeating a market someone made another way. A match skips
  that entry (`skipped-duplicate`) and the run goes on;
  `--allow-duplicate <key>=<id>` overrides after review. Sibling markets
  never block each other, and neither do the pipeline's race markets (tested
  both ways); a candidate market for a race we ask about by party is related,
  not the same question, so it doesn't block either.
- The online dry run lists a wider net for a person to read (similarity 0.4
  and up) and marks the matches that would block ("BLOCKS at apply"). Read it
  before applying: wording that shares few words with ours ("Will the
  convention be contested?") can't be caught automatically.

## Seeds (opening odds)

We don't use Kalshi's prices or data. Seeds come from Manifold's own markets,
read at run time, or from documented static priors:

| Kind | Markets | How |
|---|---|---|
| copied | 2028 D/R nominees, D/R VP nominees, 2032 D nominee, 2032 winner | Every person at ≥ 1% in the deepest community market (≤ 20), clamped to [1, 99]; the source's "Other" and long tail go to our "Other" (≥ 1%) |
| derived | 2028 VP winner | P(X) = P(X is the D VP nominee)·P(D wins) + P(X is the R VP nominee)·P(R wins), party odds from `8p6sy5snq9` |
| buckets | 2028 Democratic electoral votes; popular-vote margin | Normal(μ, σ=60 EV / 4.5 pts) with μ placed so P(270+) (or P(D>0)) equals the community odds; buckets floored at 1% |
| flattened | 102 state primaries | Nominee market weights ^0.8, ×3 for candidates from that state (`HOME_STATES` in `seeds.ts`), top 3; a single state is less predictable than the nomination. Everyone else starts in "Other" |
| party | 2028 popular vote (D/R + Other) | From the community market's D/R shares |
| copula | the five balance-of-power markets | Static, from P(Democrat) for the presidency, Senate and House (see Balance of power above) |
| static | everything else | Priors documented in the manifest (`note`) |

## Runbook (from `backend/scripts`)

1. Offline dry run (no network): validates the manifest, prints the plan.
   ```powershell
   npx ts-node --transpile-only elections-2028/create-national-markets.ts
   ```
2. Online dry run (read-only GETs against prod): live seeds, exact answer
   counts and costs, reserved ids free, duplicates among @ManifoldPolitics'
   open markets, topic ids, which candidate photos are live.
   ```powershell
   npx ts-node --transpile-only elections-2028/create-national-markets.ts --online
   ```
   Read `out/report.md`. Photos attach only to the leading run of answers
   whose photo is live on manifold.markets (the API can't skip an answer), so
   apply **after** the elections page PR with the new candidate photos is
   deployed, or accept fewer faces on the market pages.
3. Pilot one market (creates a state file; Tod runs this):
   ```powershell
   $env:MANIFOLD_API_KEY = '<@ManifoldPolitics API key>'
   npx ts-node --transpile-only elections-2028/create-national-markets.ts --apply `
     --env prod --creator-username ManifoldPolitics `
     --state C:\Users\User\elections-national-prod\state.prod.json --init-state `
     --max-mana 21000 --only "^2028-dem-nominee$"
   ```
   Check the market page (answers, odds, faces, topics, description), and that
   nobody got a notification.
4. Full run, same state file, no `--init-state`:
   ```powershell
   npx ts-node --transpile-only elections-2028/create-national-markets.ts --apply `
     --env prod --creator-username ManifoldPolitics `
     --state C:\Users\User\elections-national-prod\state.prod.json --max-mana 400000
   ```
   About 127 markets × (create, read back, publish) at `--pace-ms 400`:
   roughly 10–15 minutes. Avoid 07:45–08:15 UTC (the API restarts daily at
   08:00).
5. Afterwards, wire the new markets into the elections page config (slugs
   from the state file's `url`s).

Options: `--only <regex on key>`, `--out <dir>`, `--pace-ms <ms>` (default 250
online, 400 apply), `--env dev` (writes to dev; seeds still read prod; topics
missing on dev are dropped), `--allow-duplicate <key>=<id>,...` and
`--accept-criteria <key>,...` (see "How it stays safe to re-run").

## Tests and typecheck

From the repository root:

```powershell
$env:TS_NODE_PROJECT = 'backend/scripts/tsconfig.json'; $env:TS_NODE_TRANSPILE_ONLY = '1'
node --no-experimental-strip-types -r ts-node/register -r tsconfig-paths/register --test backend/scripts/elections-2028/national-markets.test.ts
```

`npx tsc --noEmit -p backend/scripts` typechecks every script (CI doesn't);
these files typecheck cleanly with `skipLibCheck` (without it the only errors
are a lodash/TypeScript `WeakMap` declaration clash inside `node_modules`).
