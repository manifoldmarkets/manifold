# House audit — Midwest + Northeast (agent_house_mwne)

Scope: House races in `dossier_house_midwest.md` (IL IN IA KS MI MN MO NE ND OH SD WI) and
`dossier_house_northeast.md` (CT ME MA NH NJ NY PA RI VT) with at least one linked market or a PR
source. That is **72 races**; the JSON is `out/agent_house_mwne.json`. Evidence: the 2026-10-03 snapshot
(`markets.json`, the dossiers), the PR checkout (`election-map-model.ts`, `house-market-data.ts`,
`state-election-map.tsx`) and a few **read-only** prod SQL queries I ran on 2026-10-03 to fill
discovery gaps (flagged "found by this audit" below). I wrote nothing to any database or market.

## Decision counts

| decision        | confidence                   | n   | races                                                                                                                                                                            |
| --------------- | ---------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| keep-current    | confirmed                    | 33  | Every race displayed from the original market: CT-5, IL-17, IN-1, IA-1, IA-3, ME-2, MI-3/4/7/8/10, NE-2, NH-1/2, NJ-5/7/9, NY-3/4/17/18/19/22, OH-1/9/13, PA-1/7/8/10/17, WI-1/3 |
| keep-current    | conditional                  | 24  | 20 NY-portfolio races (NY-1, 2, 5–16, 20, 21, 23–26), IA-4 (Iowa portfolio), and the PR's individual sources OH-7, OH-15 and WI-7                                                |
| add-override    | conditional                  | 1   | IA-2 → Jack1 `which-party-will-win-the-iowas-2nd` (`A2h85Z6ZSU`, found by this audit)                                                                                            |
| add-new-mapping | conditional                  | 3   | MN-1 (candidate market `zCz2z5p5St`), MN-2 and OH-10 (Midwest portfolio answers)                                                                                                 |
| needs-creation  | confirmed (no usable market) | 11  | IL-9, MI-12, MI-13, MN-3, MN-5, MN-6, MN-8, MO-1, OH-4, PA-16, SD-AL. All are safe seats, so these are low priority                                                              |

No race in this set is a special election. All are regular Nov 3, 2026 generals and none of these
states uses runoffs. Maine (ME-2) uses ranked-choice voting (RCV) for House generals, but only two
candidates are listed.

## How the PR reads these sources (from the code)

- `parseHouseAnswer` accepts only `<State>['s] <n>[st|nd|rd|th] [congressional ]district`,
  optionally followed by ` · matchup`. Anything after the district text makes it fail.
- Precedence works like this:
  1. The original market comes first.
  2. Then `HOUSE_DISTRICT_MARKETS`, in order: NY, TX, FL, CA, NV, IA.
  3. Then `HOUSE_RACE_MARKETS`. An individual market only fills a district that no portfolio already
     prices, unless it sets `preferOverPortfolio`.
- Individual markets are read as follows:
  - A sum-to-one multi is classified by label. The pattern `/democrat/i` or a "(D)" tag counts as D;
    `/republican/i` or "(R)" counts as R. `ALSO_DEMOCRATIC` covers only King and Sanders.
  - A binary is read as "YES = Republican", with NO counted as `notRep`.
- Consequences:
  - The labels "DFL", "Brad Finstad" and "Jake Johnson" all classify as **other**.
  - The Midwest portfolio prices nothing even if its slug is added (see below).

## Portfolio semantics

### 1. `will-a-democrat-win-these-us-house` (`sqUzOZN8Cs`, Robincvgr) — the original

**Proposition:** each answer asks whether a Democrat wins that district. It is an independent multi.

- Liquidity: market-level 50,000 (raised by @Gen per comment `ch7bn57u1er`).
- Each answer's `totalLiquidity` field reads 10, but the answer pools hold roughly 1,000+ shares.
- Close: 2026-12-02 05:59 UTC.

**Description (the only rules):**

- "Each option provisionally resolves once both the New York Times and Decision Desk HQ … call the
  race and do not retract the call for 24 hours. Final resolution will be according to certified
  results."
- "Whether a candidate is "a Democrat" is determined by the party affiliation displayed on the ballot
  (being a Dem as one party on a fusion ticket counts.)"

**Rules:**

- **Round:** the 2026 general. The final round is implied by certified results; RCV is not mentioned.
- **Certification:** provisional resolution on calls; final resolution on certified results.
- **Fusion:** explicitly included.
- **Affiliation timing:** affiliation on the ballot at the election, so later caucus or party
  switches are irrelevant.
- **Independents / other winners:** any non-Democratic winner resolves NO.
- **Cancellation:** unspecified.

**Creator comments:**

- `lrd66pbc7pq` (creator) is a trading offer, not a ruling. There are no other creator comments.
- Non-creator comments are not rulings:
  - `ch7bn57u1er` (@Gen) added candidate names to labels and says they "still resolve to the PARTY
    AFFILIATION and not the name!"
  - `qjxvy8q579` (@Jack1) concerns CA-40.

**Verdict:** this is the reference proposition, so it is **confirmed** for all 33 answers in these
regions. The "(D)/(R)" names in labels are cosmetic.

### 2. `which-new-york-house-districts-will` (`9nS9P2scql`, TheDucksFan)

- **Setup:** empty description, no comments, `addAnswers=ONLY_CREATOR`.
- **Size:** 26 answers (NY-1 to NY-26), 25 liquidity per answer, 8 bettors.
- **Close:** 2026-11-03 23:59 UTC.
- **Proposition (title only):** "Which New York House Districts will the Democrats win in the 2026
  midterms?" The general election is implied, not stated.
- **Unspecified:** ballot line vs caucus, fusion, certification vs calls, independents, replacement,
  cancellation.
- **Verdict:** **conditional only**, not equivalent to the original.
- **Where it shows:** it is displayed for 20 districts. It is hidden behind the original for NY-3, 4,
  17, 18, 19 and 22.
- **Thin-book signs:**
  - Safe seats are priced low: NY-5 (D+24) at 0.757, NY-14 at 0.822.
  - Hidden answers diverge from the original:
    - NY-19: 0.64 vs 0.963.
    - NY-22: 0.70 vs 0.94.
    - NY-18: 0.80 vs 0.958.

### 3. `which-iowa-congressional-districts` (`Qzqdd2ptO6`, TheDucksFan)

- **Setup:** empty description, no comments.
- **Size:** 4 answers at 25 liquidity each, 11 bettors.
- **Close:** 2026-11-04 00:00 UTC.
- **Proposition:** title only ("…will the Democrats win in the 2026 midterms?"). Every rule is
  unspecified.
- **Verdict:** **conditional**.
- **Where it shows:** displayed for IA-2 and IA-4; hidden behind the original for IA-1 and IA-3.

### 4. `which-us-house-districts-in-the-mid` (`s2uNNQ2N5I`, TW5z0p) — the PR does NOT use it

- **Setup:** empty description, no comments, `addAnswers=ANYONE`.
- **Size:** 19 answers at 25 liquidity each, 10 bettors.
- **Close:** 2026-11-03 23:59 UTC.
- **Title:** "Which US House districts in the Midwest will a Democrat win?" It has **no year** and no
  round. Only the close date and the `2026-us-congressional-elections` group tie it to 2026.
- **Scope quirk:** it includes PA-7/8/10, so "Midwest" is loose.
- **Unspecified:** ballot affiliation, DFL, certification, independents, fusion, replacement,
  cancellation.
- **Verdict:** **conditional**.
- **Parser problem:** none of the 19 labels parse, because every label ends in an incumbent tag such
  as "(OPEN-R)" or "(Max Miller-R)". Adding the slug to `HOUSE_DISTRICT_MARKETS` would price
  **nothing**. Using it needs explicit answer-id mappings or a parser change.
- **Label typos:** "Iowa's 2st", "Iowa's 3st", "Bresnehan", and "Ohio’s 7th congressional
  district(Max Miller-R)" (no space before the parenthesis).

| answer         | label                                           | p     | PR status                 |
| -------------- | ----------------------------------------------- | ----- | ------------------------- |
| ucCzAd2du2     | Nebraska's 2nd district (OPEN-R)                | 0.893 | priced by original (0.91) |
| OAzOCZCsd9     | Iowa's 1st district (Miller-Meeks-R)            | 0.793 | original (0.85)           |
| NR2NlEE0gg     | Iowa's 2st district (OPEN-R)                    | 0.467 | Iowa portfolio (0.488)    |
| 9yEpzcq5NU     | Iowa's 3st district (Nunn-R)                    | 0.767 | original (0.75)           |
| **stU2599nn5** | Minnesota's 1st district (Finstad-R)            | 0.329 | **UNPRICED**              |
| **SSlgtzn9gz** | Minnesota's 2nd district (OPEN-D)               | 0.874 | **UNPRICED**              |
| Ph0U5zOQ5s     | Wisconsin's 1st district (Steil-R)              | 0.351 | original (0.34)           |
| CsqQy95Q6p     | Wisconsin's 3rd district (Van Orden-R)          | 0.733 | original (0.72)           |
| CtgI62lQuO     | Michigan's 4th district (Huizenga-R)            | 0.398 | original (0.47)           |
| Lu5yc5t2nS     | Michigan's 7th district (Barrett-R)             | 0.623 | original (0.59)           |
| nNzpnRz6P6     | Michigan's 8th district (McDonald Rivet-D)      | 0.918 | original (0.96)           |
| 6gUhyuLgzI     | Michigan's 10th district (OPEN-R)               | 0.625 | original (0.655)          |
| zpuPEqAc29     | Ohio's 1st district (Landsman-D)                | 0.880 | original (0.87)           |
| uUC2t8CLs8     | Ohio's 9th district (Kaptur-D)                  | 0.675 | original (0.70)           |
| **8p5pl6cgSE** | Ohio's 10th district (Turner-R)                 | 0.207 | **UNPRICED**              |
| SPRUIUnSOQ     | Pennsylvania's 7th district (Mackenzie-R)       | 0.784 | original (0.81)           |
| CLNNCLEE2P     | Pennsylvania's 8th district (Bresnehan-R)       | 0.617 | original (0.68)           |
| qNuQEEu6nA     | Pennsylvania's 10th district (Perry-R)          | 0.763 | original (0.79)           |
| 2AR60duhUd     | Ohio’s 7th congressional district(Max Miller-R) | 0.617 | individual OH-7 (D 0.79)  |

**Precedence trap:** if this portfolio is ever added with a parser fix, its OH-7 answer would outrank
the PR's OH-7 individual market, because portfolios beat individuals. Set `preferOverPortfolio` on
OH-7 if you want to keep the party market.

### 5. `which-new-hampshire-house-seats-wil` (`Il0ICQS6cp`, TheDucksFan) — not in the PR

- **Setup:** empty description, no comments, groups mis-tagged (`us-senate`, `118th-congress`).
- **Answers:** 2, at 50 liquidity each. NH-1 and NH-2 are both at 0.90.
- **Parsing:** the labels parse.
- **Verdict:** conditional, and not needed, because the original covers NH-1 and NH-2 with confirmed
  rules.

### 6. Other multi-race markets touching these states (all rejected as race sources)

- `will-democrats-win-any-of-these-hou` (`Ochy0zp2sz`, Jack1, found by this audit) is a
  **combined** "any Cook solid-R seat" binary. Its list includes MI-1/2/5/9, MN-6/7/8, MO-2…8, ND-AL,
  NE-1/3, NJ-2/4, NY-1/2/11/21/23/24, OH-2/4/5/6/8/12/14 and WI-5…8.
- `rank-the-last-called-us-house-races` (`yA5c9Cny5L`) is about call timing (ME-02, NY-11, NY-17,
  NY-22).
- `what-national-dsaendorsed-candidate` (`0dsd2nQ9h9`) has answers for MI-12, MI-13 and MO-1, but all
  are PRIMARY answers and already resolved.
- The count markets `how-many-democratic-representatives-z8ynIAnUPL` (IL) and `-Pc9ysPsQlN` (NY) are
  statewide totals, not per-district.
- `how-many-of-max-miller-cory-mills-a` (`pRZNR6ld9U`) is a combined count.

## New York fusion

| source                                                                                           | treatment of a fusion ticket                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| original `sqUzOZN8Cs`                                                                            | **Explicit:** "being a Dem as one party on a fusion ticket counts". A D+WFP candidate is a Democrat. R+Conservative fusion is irrelevant (NO).                             |
| NY portfolio `9nS9P2scql`                                                                        | **Unspecified** (empty description). The title says "the Democrats win".                                                                                                   |
| NY-12 `who-will-win-the-ny12-congressional` (`uUh58gIOuS`, dog)                                  | **Explicit, candidate-based:** "party line(s) under New York's fusion voting are irrelevant"; "votes across party lines aggregate to the person"; certified NYSBOE winner. |
| NY-7 `8ldpgzgc0R`, NY-8 `synIq2L5hP`, NY-10 `suQUUs9EAR`, NY-12 `q5qtp9dApN`, NY-13 `Ps8ztlqptP` | Candidate markets. Fusion is moot (they resolve to the person) but never stated.                                                                                           |
| NY-13 `will-adriano-espaillat-run-in-the-2` (`uAd96ZRSuA`)                                       | Its subject _is_ the fusion/third-party edge case: YES if Espaillat is on any non-D/R line or is a registered write-in.                                                    |

What the certified list (inventory, NYSBOE 9/17) shows:

- **Democratic candidates on D + WFP lines:** NY-2, 7, 10, 13, 14, 17, 18, 19, 20, 22, 23, 24 and 25.
- **Democratic candidates on the Democratic line only:** NY-3, 4, 26 and others.
- **Republicans on R + Conservative lines:** most districts.
- **NY-15** splits the lines: Republican Sapaskis and Conservative Duran are separate candidates.

**No Democrat appears only on the WFP line, and Espaillat is not on the ballot.** So the NY portfolio's
silence on fusion does not change any 2026 outcome as listed. It would matter only if a
minor-line-only candidate won. The Espaillat market should resolve NO if the certified list is right.

## The PR's individual House sources in these regions

**OH-7 — `which-party-wins-ohio-7th-congressi`** (`2s6nul8lsu`, Jack1)

- **Format:** sum-to-one multi with answers "Democrats" (`nqEZI8qdOZ`, 0.79) and "Republicans"
  (`9sZRccZSN6`, 0.21).
- **Size:** 50 liquidity per answer, 17 bettors, last bet 2026-10-02.
- **Rules:** the description is a Wikipedia link plus "Resolves yes to the winner." There are no
  comments. It does not state the general election (the market was created 2026-05-07, after the
  May 5 primary). Certification and non-D/R winners are unspecified, and there is no Other answer.
- **Precedence:** **DISPLAYED.** Nothing earlier in precedence has OH-7, because the Midwest portfolio
  is unused and unparseable.
- **Verdict:** suitable with caveats, conditional.
- **Price disagreement:** candidate market `nllu2ZuNs8` has Poindexter at 0.769; the Midwest portfolio
  has 0.617.
- **Recommendation:** subsidise 500 and ask Jack1 for rules.

**OH-15 — `which-party-will-win-ohios-15th-con`** (`Rn8zlNdz62`, Jack1)

- **Format:** "Republicans" 0.76 / "Democrats" 0.24.
- **Size:** 50 liquidity per answer, 8 bettors.
- **Rules:** the entire description is a Wikipedia link. There are no comments and no Other answer,
  even though Libertarian Barrington is on the ballot.
- **Precedence:** **DISPLAYED.**
- **Verdict:** this is the weakest-specified PR source here; title-only, conditional.
- **Recommendation:** subsidise 300 once a rule is added.

**WI-7 — `republicans-win-wisconsin-7th-congr`** (`g8pgO2Q9zP`, Jack1)

- **Format:** binary, YES = Republican wins (0.94).
- **Size:** 125 liquidity, volume 3,864, 16 bettors.
- **Rules:** the description is a Wikipedia link only. The creator's 4 comments are trading banter
  with no rules.
- **What NO means:** "Not R", not "Democrat". With only Alfonso (R) and Clark (D) listed it is
  practically D, but the market does not say so.
- **How the PR reads it:** the PR's binary path does this correctly, with `rep = 0.94` and
  `notRep = 0.06` shown as "Not R", never added to D.
- **Precedence:** **DISPLAYED.**
- **Verdict:** keep, conditional.
- **Live limit order:** 1 mana on YES @0.81.

KY-6 is South and was skipped.

## Minnesota (DFL)

- The original market has **no Minnesota answers**, so the DFL question never arises there. Its
  ballot rule ("party affiliation displayed on the ballot") would make "Democratic-Farmer-Labor" a
  judgement call.
- The Midwest portfolio covers MN-1 and MN-2 with "a Democrat". **Whether DFL counts is unspecified.**
  The only hint is the label "Minnesota's 2nd district (OPEN-D)" for Craig's DFL seat. That label
  implies the creator treats DFL as D, but it is not a rule.
- The MN-1 candidate market (`zCz2z5p5St`) explicitly labels "Jake Johnson (DFL – challenger)". It
  settles on certified MN Secretary of State results.
- The PR's `isDemocraticAnswer` would **not** classify an answer labelled "DFL" or "Jake Johnson" as
  Democratic. It needs an explicit answer→party map.
- North Dakota's "Democratic-NPL" (ND-AL) has the same issue, but there is no market.

## Single-candidate seats (flag for the verification step)

- **MA-2 (McGovern), MA-5 (Clark) and MA-7 (Pressley)** each list one candidate with status
  "Incumbent re-elected".
- **WI-2 (Pocan)** in the Midwest has the same pattern.
- **No market covers any of them:**
  - no answer in the original or in any portfolio;
  - no individual market in the dossiers, `classified.json`, or my read-only district/name queries.
- They fall outside this file's 72 races, since they have no market and no PR source.
- **Verification needed:** confirm whether each is _unopposed on the ballot_ or _not on the ballot_.
  My fetch of the MA Secretary of State candidate page returned no content (JS-rendered), so this is
  unverified.
- **Related seats with no Republican nominee:** PA-3 (Rabb D vs an independent) and NJ-8 (Menendez D
  vs three independents).

## Unpriced districts with coverage outside the PR (new mapping candidates)

| district   | source                                              | answer                                                       | p                             | note                                                                                                                                            |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| MN-1       | `who-will-win-the-us-house-seat-for` (`zCz2z5p5St`) | Finstad `pC2UuEPzpd` / Johnson `cPRscthtLS` / Morlan / Other | 0.745 / 0.236 / 0.009 / 0.010 | Best-specified market in the region (certified, recounts, withdrawals). It is a candidate market, so it needs a party map. Last bet 2026-08-19. |
| MN-1 (alt) | Midwest `s2uNNQ2N5I`                                | `stU2599nn5`                                                 | 0.329 D                       | Conditional, unparseable                                                                                                                        |
| MN-2       | Midwest                                             | `SSlgtzn9gz`                                                 | 0.874 D                       | Conditional; DFL unspecified                                                                                                                    |
| OH-10      | Midwest                                             | `8p5pl6cgSE`                                                 | 0.207 D                       | Conditional                                                                                                                                     |

## Discovery gaps found by this audit (read-only prod queries, 2026-10-03)

**Not in `markets.json` or `classified.json`:**

- `which-party-will-win-the-iowas-2nd` (`A2h85Z6ZSU`, Jack1):
  - Answers: "Democrats" 0.54 / "Republicans" 0.46.
  - Rule: "Resolves according to the winner in November."
  - Size: 50 per answer, 12 bettors.
  - No Other answer, even though an independent and a Libertarian are on the ballot.
  - I recommend it as an **override** for IA-2 (`preferOverPortfolio`), conditional. It is a marginal
    upgrade over the empty-description Iowa portfolio.
- `Ochy0zp2sz` and `pRZNR6ld9U` are combined markets, rejected.

**In `classified.json` but not linked (the district text did not parse):**

- `will-the-republicans-gain-maines-2n` (`pu9NhnpIUQ`, ME-2):
  - Rule: explicit "YES if a Republican wins … NO if a Democrat wins", Maine Secretary of State
    results, RCV noted.
  - p(R) = 0.66.
  - Jack1 has 19,250 mana of NO limit orders at 0.66–0.69, expiring 2026-10-04 04:58 UTC.
  - It is a useful cross-check (original D 0.358).
- `wisconsin-us-house-district-three-g` (`2ZNsgPQ58c`, WI-3) is a candidate binary on Van Orden
  (0.267), related-only.

**Also rejected:** ME-2's `will-a-republican-win-the-me02-dist` (`0spU6nEQ8p`), which **closes
2026-10-31 03:59 UTC, before Election Day**.

## Subsidies proposed (apply each once)

| contract                  | amount | condition                                                                                |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `2s6nul8lsu` OH-7         | 500    | Now. Displayed, competitive, sources disagree.                                           |
| `Rn8zlNdz62` OH-15        | 300    | After Jack1 adds a resolution rule.                                                      |
| `A2h85Z6ZSU` IA-2         | 500    | If adopted as the override.                                                              |
| `9nS9P2scql` NY portfolio | 1,300  | After TheDucksFan adds rules (repeated on all 20 NY-portfolio race objects; apply once). |
| `s2uNNQ2N5I` Midwest      | 500    | After TW5z0p adds rules (repeated on MN-2 and OH-10; apply once).                        |

## Open questions for creators

- **TheDucksFan** (NY, Iowa and NH portfolios):
  - Ballot affiliation or caucus?
  - Do Democratic fusion lines count?
  - Certified results or media calls?
  - Does an independent winner resolve NO?
- **TW5z0p** (Midwest portfolio): the same questions, plus the year, whether DFL counts, and fixing
  the "2st"/"3st" labels and the trailing tags.
- **Jack1** (OH-7, OH-15, WI-7, IA-2): certified results vs calls, and how a non-D/R winner resolves.

## Data artifacts noticed

- `markets.json` lists `Ps8ztlqptP` (NY-13) answers twice.
- The inventory has `{{endplainlist}}` candidate rows for MI-7 and NY-22. I skipped them.
- Ohio's inventory candidate source is NYT primary results, not an official list.
- The MN-1 candidate market is tagged `2024-us-presidential-election`.
