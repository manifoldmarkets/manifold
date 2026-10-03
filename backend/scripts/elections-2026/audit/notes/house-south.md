# House South audit notes (AL AR DE FL GA KY LA MD MS NC OK SC TN TX VA WV)

Auditor scope: the 87 South House races in `dossier_house_south.md` with at least one linked market or a PR source.
The other 77 South districts (no link, no PR source) are left to the separate step. Output: `agent_house_south.json`.
Evidence: read-only snapshot (2026-10-03 00:50–00:58 UTC) in `markets.json` / `races.json`, plus PR #4114 code at
`C:/Projects/manifold-wt-elections-audit`. Nothing was written anywhere except these two files.

## 1. Results

| Decision        | Count | Confidence                    | Races                                                                                                                                                                                        |
| --------------- | ----- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| keep-current    | 62    | 10 confirmed / 52 conditional | Confirmed: FL-13, FL-23, NC-1, TX-15, TX-28, TX-34, VA-1, VA-2, VA-7, VA-10 (original market). Conditional: 25 FL portfolio districts, 26 TX districts on the TheDucksFan TX portfolio, KY-6 |
| switch          | 9     | conditional                   | TX-1, 2, 5, 9, 12, 17, 23, 32, 35, from TheDucksFan's TX portfolio to Jack1's TX portfolio                                                                                                   |
| add-new-mapping | 4     | conditional                   | AL-2 (Figures binary), NC-9 (Ojeda binary), NC-11 (candidate multi), GA-1 (party multi)                                                                                                      |
| needs-review    | 1     | conditional                   | TN-9 (MaxHarms multi has no answer for the R nominee)                                                                                                                                        |
| needs-creation  | 10    | confirmed\*                   | DE-AL, GA-2, GA-3, GA-14, KY-4, LA-1, LA-4, LA-6, OK-5, SC-6 (the only links are name or topic collisions)                                                                                   |
| out-of-scope    | 1     | conditional                   | FL-10 (Frost is unopposed, so the seat is not on the Nov 3 ballot; official check pending)                                                                                                   |

\* For needs-creation, "confirmed" means it is confirmed that no linked market fits the race. It does not describe a match.

### Key findings

1. **The original market is sound in the South.** All 10 South answers parse to the right district, use the ballot-party rule and settle on certified results. The stored per-answer `totalLiquidity` is 10, but that field is stale. The answer pools show the 50k subsidy: k = √(YES·NO) ranges from about 200 (FL-23) to about 690 (VA-1).
2. **Three of the original market's limit orders are phantom.** FL-23 (1,967 @0.95), VA-7 (8,944 @0.92) and VA-10 (996 @0.92) are YES orders with 0 balance-funded mana.
3. **Texas: put Jack1's portfolio ahead of TheDucksFan's for the 9 districts it covers** (see §3). Its criteria are written down, each answer has 4× the liquidity, and it has 17 vs 5 bettors and 35k vs 2.5k volume. One difference: it counts a Democratic _caucuser_ as YES, where the original counts only a Democratic _ballot label_.
4. **TheDucksFan's TX portfolio overprices Democrats in safe-R seats.** Its 22 districts at R+10 or redder carry a combined 2.9 expected Democratic seats (7–20% each, e.g. TX-19 R+25 at 9.2%, TX-26 R+11 at 19.5%). Its safe-D answers are underpriced at about 0.87–0.93. The net effect inflates expected Democratic seats by about 2 for Texas alone. A subsidy is proposed. A different source is not proposed, because there is no better source for those 26 districts.
5. **The PR cannot yet show candidate-binary markets where YES is the Democrat.** `electionOdds()` reads every binary YES as Republican, so the two best new South leads (AL-2 Figures and NC-9 Ojeda) would be shown inverted. Map them only after adding a YES = named-Democrat flag.
6. **KY-6 (the current PR mapping) and the NC-11 lead have no "Other" answer.** Third-party candidates on the ballot (KY-6: Bowman (I), Lynch (Kentucky Party); NC-11: Groo (L)) have nowhere to resolve.

### Blockers and open items

- **FL-20 and TX-23 are vacant seats.** Neither governor had set a special election in the reports found ([KERA, Apr 2026](https://www.keranews.org/politics/2026-04-16/when-will-gov-abbott-call-a-special-election-for-texas-23rd-congressional-district); [Ballotpedia News, Apr 2026](https://news.ballotpedia.org/2026/04/22/sheila-cherfilus-mccormicks-resignation-leaves-floridas-20th-congressional-district-vacant/)). Wikipedia has a page titled "2026 Texas's 23rd congressional district special election", which redirected when fetched. If a special for the unexpired term runs on Nov 3, possibly on the old lines, no portfolio answer says which contest it settles on. The verification agent needs to confirm.
- **The Louisiana format** (Nov 3 all-party primary, Dec 12 runoff) is from news reports only (§4).
- **FL-10 being unopposed** is confirmed by the inventory and a creator comment. An official FL DOS check is pending.

## 2. Portfolio semantics (South usage)

### 2a. `will-a-democrat-win-these-us-house` (`sqUzOZN8Cs`, Robincvgr): the original market

- **Proposition:** a Democrat wins the listed district. Independent multi, sumToOne=false, addAnswers DISABLED, close 2026-12-02 05:59 UTC.
- **Party rule (description):** "Whether a candidate is 'a Democrat' is determined by the party affiliation displayed on the ballot (being a Dem as one party on a fusion ticket counts.)". This makes it ballot-label based and fusion-inclusive. Independents and third parties resolve NO. Later caucus or party switches do not matter.
- **Certification (description):** "provisionally resolves once both the New York Times and Decision Desk HQ … call the race and do not retract the call for 24 hours. Final resolution will be according to certified results."
- **Round:** "call the race" implies the final winner. Runoffs are not mentioned, but no South answer is in a runoff state: the South answers are FL-13, FL-23, NC-1, TX-15, TX-28, TX-34, VA-1, VA-2, VA-7 and VA-10, all plurality states.
- **Unspecified:** replacement (moot, since the rule is party-level), cancellation, and redistricting. All answers were created 2025-02-08, before the 2025–26 FL, NC and TX redraws. The 2026 candidate names in the labels and the current prices imply the new districts. Example: "Florida 23" at 0.95 matches Frankel's D+9 seat, not Moskowitz's old swing seat. There is no creator ruling on this.
- **Comments:**
  - Creator: `lrd66pbc7pq`, a trade offer only, not a ruling.
  - Non-creator, none of them rulings:
    - `ch7bn57u1er` (@Gen, staff) added candidate names to labels and wrote "They still resolve to the PARTY AFFILIATION and not the name!"
    - `qjxvy8q579` (Jack1, CA-40).
    - `ipc04xnq5gn` (EvanDaniel) links a companion, `yNqLI9gPuZ` "How many 'safe' House seats will flip in 2026?". That market counts independents by caucus and is a multi-race count, so it is excluded.
    - `fgmin0v1gm7` (Jack1) has empty text in the snapshot. Read via the public API, it is a contract-mention of the AL-2 Figures market (`2gnh0c6NqI`).
- **Equivalence:** this is the reference market. Equivalent by definition.

### 2b. `which-florida-house-districts-will` (`cN025dzLdO`, TheDucksFan)

- 27 answers (FL-10 omitted), 25 liquidity each (675 total), 3 bettors, 1,232 volume, last bet 2026-09-26, close 2026-11-03 23:59 UTC, addAnswers ONLY_CREATOR.
- **The description is empty.** The only creator comment, `d1bfvc3zoyu`: "If there is a change in Florida's 10th Congressional District, it will be added. However, as of now, the only candidate is Maxwell Frost."
- **Unspecified:**
  - party basis (ballot label vs caucus) and treatment of independents. The title asks whether "the Democrats" win.
  - calls vs certification.
  - round (moot: Florida is plurality).
  - fusion (moot: no FL candidate has two ballot lines in the inventory).
  - replacement and cancellation.
  - regular vs special for the vacant FL-20.
- **Equivalence:** conditional only. Usable as a Dem-win proposition with a label saying its rules are unstated.

### 2c. `which-texas-house-districts-will-th` (`NZuO50NCLg`, TheDucksFan): the PR's Texas source

- 38 answers (all districts), 25 liquidity each (950 total), 5 bettors, 2,489 volume, last bet 2026-10-02, created 2026-07-29, addAnswers DISABLED.
- **Empty description and no comments.** Everything listed for 2b is unspecified here too. Fusion is moot (no multi-line TX candidates).
- **Equivalence:** conditional only.

### 2d. `which-texas-us-house-districts-will` (`SRynqNSuEL`, Jack1): not used by the PR

- 12 answers, 100 liquidity each (1,201 total), 17 bettors, 35,134 volume, created 2026-03-18 after the Mar 3 primary, close 2026-11-03 23:59 UTC, addAnswers ONLY_CREATOR.
- **Description:** "Resolves according to if a Democrat or Democratic caucuser wins the districts general election in 2026. Resolves according to party identification/ who they caucus with."
  - **Round:** the general election. Texas is plurality.
  - **Independents:** count YES if they caucus with Democrats. **This differs from the original market.**
  - **Unspecified:** certification vs calls, and when caucus membership is judged.
  - **Fusion:** moot in Texas.
- **Creator comments:**
  - `i4ydzoubcw`: adds districts he thinks could be competitive.
  - `1s8kbah928`: added TX-32 on EvanDaniel's request (`ypcdnn38swc`).
  - `n78oommdqc`: invites bots.
  - `spcn0gjnz4r`: asks @Gen to treat TX-35 and TX-23 as competitive on the dashboard and to add liquidity.
  - `b1300r8zjza`: mentions only (read via API).
  - `9p58k5u6cln`: bonus offer.
  - None of these change the rules.
- **Equivalence:** conditional. Same as the original when a D or R wins. Differs only if an independent who caucuses with Democrats wins (TX-23 has Ben Mendoza (I)). Party ID and caucus are also judged differently from the ballot label.

### 2e. Individual South markets used or proposed

| Race  | Market                                                  | Proposition                                         | Rules found                                                                                          | Status                               |
| ----- | ------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| KY-6  | `65ShsdN2Oh` Jack1 "Who will win Kentuckys 6th…"        | candidate multi: Alvarado (R) / Dembo (D), no Other | description is only a Wikipedia link; addAnswers DISABLED                                            | current PR source; keep with caveats |
| AL-2  | `2gnh0c6NqI` Jack1 "Will Democrat Shomari Figures win…" | candidate-binary (YES = Figures)                    | title, plus "new redrawn district … trump+14.3"; no certification or round text                      | new lead; liquidity 1,000            |
| NC-9  | `RZSnU2csSI` Jack1 "Will Richard Ojeda win…"            | candidate-binary (YES = Ojeda)                      | "wins … in Novembers election"                                                                       | new lead; liquidity 101 → subsidy    |
| NC-11 | `ZLcuNpd9ZS` Fastcar99 "NC-11 House winner?"            | candidate multi: Ager (D) / Balkcom (R), no Other   | "Resolves YES to the winner of the … 11th congressional district election in 2026." Close 2027-11-03 | new lead; liquidity 2,000, 2 bettors |
| GA-1  | `EyzOtEtsgP` Tetraspace "Which party will win GA-01…"   | party multi: Republican / Democratic / Other        | empty description                                                                                    | new lead → subsidy                   |
| TN-9  | `9pNhdgpgzz` MaxHarms "Who will win the TN-9…"          | candidate multi created before the primary          | empty; R nominee Brent Taylor has no answer; Other is at 0.726                                       | needs review                         |

**Excluded multi-race markets** (none is a single-race winner proposition):

| Market                                                      | Why excluded                  |
| ----------------------------------------------------------- | ----------------------------- |
| `rank-the-last-called-us-house-races`                       | call timing                   |
| `which-representative-or-senator-wil`                       | WAR (performance metric)      |
| `which-incumbent-representative-or-s`                       | WAR (performance metric)      |
| `congressional-survivor-who-will-be`                        | last member standing          |
| `what-national-dsaendorsed-candidate`                       | the FL-25 answer is a primary |
| `how-many-safe-house-seats-will-flip` (`yNqLI9gPuZ`)        | delegation or seat count      |
| LA count `dhdspq8ISp`                                       | delegation count              |
| TX count `uqR85u5Sc9`                                       | delegation count              |
| FL count `tOt2gyuLyL`                                       | delegation count              |
| VA count `8ZNNtUnZAp`                                       | delegation count              |
| `how-many-of-the-redrawn-texas-distr` (`Py8dLnl5ZZ`)        | seat count                    |
| `will-texas-elect-a-democratic-senat` (`2NuldyOd50`)        | combined Senate + House       |
| `will-a-democrat-win-a-house-of-repr` (`shlnZcOUsq`, Jack1) | any Arkansas district         |

## 3. Texas: the two portfolios compared answer by answer

Every answer in both portfolios was run through a Python port of the PR's `parseHouseAnswer`, and all parse to the intended district. "Texas 17th district " has a trailing space, which `trim()` handles. Precedence in the PR is original → `HOUSE_DISTRICT_MARKETS` order, so the original keeps TX-15, 28 and 34.

| District | PVI  | Original answer (p, vol) | Jack1 answer (p, liq, vol)     | TheDucksFan answer (p, liq, vol) | Recommendation                                            |
| -------- | ---- | ------------------------ | ------------------------------ | -------------------------------- | --------------------------------------------------------- |
| TX-1     | R+24 | -                        | `RcusN8PCnp` 0.050, 100, 710   | `8ZqphIpgcA` 0.104, 25, 161      | switch to Jack1                                           |
| TX-2     | R+11 | -                        | `cnshyE56hc` 0.060, 100, 818   | `2RhqPS6scl` 0.129, 25, 40       | switch to Jack1                                           |
| TX-5     | R+10 | -                        | `pgP06tZC8Q` 0.123, 100, 820   | `puAS2qgAsd` 0.134, 25, 61       | switch to Jack1                                           |
| TX-9     | R+9  | -                        | `5Rc9AUSqPP` 0.190, 100, 21839 | `ZNRydlOlIO` 0.192, 25, 38       | switch to Jack1 (also YES limits 1,873 funded @0.18–0.19) |
| TX-12    | R+11 | -                        | `0PN5Qgl5pO` 0.098, 100, 666   | `N8tAZ0NCz2` 0.074, 25, 86       | switch to Jack1                                           |
| TX-15    | R+7  | `nZt6lOtuyN` 0.800, 1785 | `LOysz0Qsz2` 0.800, 100, 1621  | `tU2PUNIcQC` 0.770, 25, 35       | keep original                                             |
| TX-17    | R+10 | -                        | `zPRpRnIpsc` 0.080, 100, 823   | `p2qZst0A6L` 0.081, 25, 90       | switch to Jack1                                           |
| TX-23    | R+7  | -                        | `qzAQl0ZuLU` 0.360, 100, 1876  | `INE6y5OLhu` 0.373, 25, 13       | switch to Jack1                                           |
| TX-28    | R+3  | `CIzdu6Ad6c` 0.880, 1004 | `s5AQc5L8Rc` 0.880, 100, 1582  | `pR2Q5I0syR` 0.848, 25, 48       | keep original                                             |
| TX-32    | R+8  | -                        | `pE6Cgt95d9` 0.097, 100, 561   | `uRQh62cNnL` 0.120, 25, 43       | switch to Jack1                                           |
| TX-34    | R+3  | `PctUcttthN` 0.820, 685  | `5hPAC6pdU2` 0.820, 100, 669   | `PcSS2CsNhh` 0.818, 25, 28       | keep original                                             |
| TX-35    | R+4  | -                        | `IQSLgun8IL` 0.620, 100, 3148  | `l8P2PLpPQc` 0.604, 25, 6        | switch to Jack1                                           |

**Recommendation.** Insert `'which-texas-us-house-districts-will'` into `HOUSE_DISTRICT_MARKETS` immediately before `'which-texas-house-districts-will-th'`. This is a precedence change, and it switches exactly the 9 districts above. Reasons, in order:

1. **Proposition.** Jack1 has written criteria (D or D-caucuser wins the general election). TheDucksFan's description is empty.
2. **Depth.** 100 vs 25 per answer, 17 vs 5 bettors, 35k vs 2.5k volume, and the only live Texas limit orders.
3. **Responsiveness.** The creator replies in comments.

Both portfolios stay **conditional** relative to the original. Label Jack1's answers as "D or D-caucusing winner".

Keep TheDucksFan's portfolio for the other 26 districts: TX-3, 4, 6, 7, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21, 22, 24, 25, 26, 27, 29, 30, 31, 33, 36, 37 and 38. It is their only Dem-win source. Ask TheDucksFan to add a description that matches the original (ballot label, fusion, certified results). Subsidize it (§6).

**Texas alternatives considered:**

| District | Market                                                                                            | Verdict                                                    |
| -------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| TX-10    | MaxHarms candidate multi (`LtIAI6Scnn`): Gober (R) 0.842, Rourk (D) 0.100, 6 stale primary losers | conditional only                                           |
| TX-23    | MichaelTaylor4217 candidate multi (`6ptAl9NhCO`): 1,000 liquidity but 3 bettors, candidate tags   | conditional only                                           |
| TX-23    | lukt party multi (`NdRIldQ50U`): no Other answer for Mendoza (I), empty description               | conditional only                                           |
| TX-9     | margin market (`yuNutltO52`)                                                                      | rejected                                                   |
| TX-12    | margin market (`n8szOUcQ5g`)                                                                      | rejected                                                   |
| TX-15    | Jack1 "Will Republicans win the Texas 15th" (`d9zqPUpqZ0`) and its clone (`D074040b01`)           | conditional only: party-binary R, and NO is "not R", not D |

**The 2025 map is in use.** Market `l8dh6t2gCE` is at 95.6% YES, which is a price, not a ruling. The inventory lists new seats TX-9, 32 and 35, which matches. Both portfolios were created after the March primaries, so their district numbers refer to the 2026 lines.

## 4. Louisiana

- **No district-level Louisiana market exists.** The links for LA-1 (Scalise), LA-4 (Mike Johnson) and LA-6 (Chris Johnson) are Speaker, filibuster and Minnesota-governor name collisions. They are rejected, and those districts are marked needs-creation.
- **The only Louisiana House market** is the count market `dhdspq8ISp`: EnopoletusHarding, "How many seats will Democrats win in Louisiana in the national 2026 House elections?". It has an **empty description**, answers 0–6, liquidity 175, 12 bettors, and **closes 2026-11-03 23:59 UTC**, before any Dec 12 runoff. It says nothing about round or runoff, and it is excluded as a multi-race count.
- **Format, from news reports (the official check is the verification agent's).** HB 842 (May 2026) moved all six U.S. House races to a Nov 3 all-party open primary under the post-_Callais_ map. A Dec 12 runoff follows if no one wins a majority. Sources: [WAFB 2026-05-14](https://www.wafb.com/2026/05/14/louisiana-house-passes-hb-842-changes-2026-race-congress/), [KTBS](https://www.ktbs.com/news/arklatex-politics/louisiana-house-passes-bill-scheduling-nov-3-open-primary-for-congressional-house-seat/article_422e454a-47cd-4a14-9c3e-cbaecae1a371.html). The same-party lists in the inventory (e.g. LA-5 has 6 R and 3 D; LA-6 has 7 R) match this.
- **Implications for any Louisiana source:**
  - It must resolve on the **final round**.
  - It must close **after Dec 12**.
  - It must not say "general election", because legally Nov 3 is the primary and Dec 12 is the general.
  - A same-party runoff (e.g. R vs R) settles the party outcome on Nov 3.
  - The original market's Dec 2 close would be too early for Louisiana answers. That is moot, because it has no Louisiana answers and does not allow adding them.

## 5. Special cases

### GA-13: no market, so no JSON object

- The inventory shows Everton Blair (D) won the special election for the rest of David Scott's term. He lost the nomination for the full term.
- The Nov 3 **regular** race is Jasmine Clark (D) vs Jonathan Chavez (R). Blair is not on that ballot.
- No market or PR source covers GA-13, and no South portfolio includes Georgia. Any future market that names Blair as the 2026 candidate would be wrong.
- **Georgia runoffs:** Georgia requires a majority in the general election and holds a runoff about 4 weeks later. New GA markets (GA-2 in particular) must resolve on the final round. GA-1 has only two listed candidates, so a runoff there is unlikely.

### FL-10: out-of-scope

- The inventory lists only Maxwell Frost (status "Incumbent re-elected"). The Florida portfolio's creator left FL-10 out for that reason (`d1bfvc3zoyu`).
- Under Fla. Stat. 101.151(7), the names of unopposed candidates do not appear on the general-election ballot, and the candidate is deemed elected ([statute](https://www.flsenate.gov/Laws/Statutes/2025/101.151)). So no FL-10 race is on the ballot to map.
- **Recommendation:** once the official check confirms no write-in qualified, count FL-10 as a **decided Democratic seat** outside market totals rather than "unpriced". `seatSummary` already does this for Senate seats not on the ballot; for the House it currently uses `held = {dem: 0, rep: 0}`.

### TX-18: Menefee

- Christian Menefee (D) won the 2026 special election. He then beat Al Green, who moved from the old TX-9, for the nomination in the redrawn TX-18 (inventory: "Incumbent lost renomination").
- The Nov 3 race is Menefee (D) vs Ronald Whitfield (R).
- The PR source, TheDucksFan answer `Og09CtPUcP` (0.927), is a party proposition, so the change of nominee does not matter. No market names Green, and Jack1's portfolio does not cover TX-18. Keep the current source (conditional).

### Vacant FL-20 and TX-23

- FL-20: Cherfilus-McCormick resigned 2026-04-21. Wasserman Schultz (D) is the nominee for the new FL-20.
- TX-23: Gonzales resigned 2026-04-14.
- Neither the portfolio answers nor the Jack1 rules say regular vs special. See Blockers in §1.

## 6. Unpriced South districts with existing non-PR coverage (new mapping candidates)

| District                                     | Market                                                 | Fit                                               | Action                                                                              |
| -------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| AL-2 (R+7 redraw, Figures (D) v Marques (R)) | `2gnh0c6NqI` binary, 1,000 liquidity, p 0.30           | candidate-binary, YES = D candidate               | add once the PR supports YES = D binaries                                           |
| NC-9 (R+8, Hudson (R) v Ojeda (D))           | `RZSnU2csSI` binary, 101 liquidity, p 0.24, 19 bettors | candidate-binary with explicit November criterion | add (same PR prerequisite) and subsidize 900                                        |
| NC-11 (R+5 open)                             | `ZLcuNpd9ZS` multi, 2,000 liquidity, Ager (D) 0.64     | candidate multi, no Other (Groo (L) missing)      | add via `HOUSE_RACE_MARKETS` (sumToOne path tags D/R correctly)                     |
| GA-1 (R+8 open)                              | `EyzOtEtsgP` party multi, 100 liquidity                | Republican / Democratic / Other                   | add and subsidize 400                                                               |
| TN-9 (R+9 per inventory)                     | `9pNhdgpgzz` multi, 125 liquidity                      | Other at 0.726 is mostly the R nominee            | needs review: ask MaxHarms to add "Brent Taylor (R)", otherwise create a new market |

**Seen and rejected:**

| Market                                                            | Reason                                                                                                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 `nAgpZAq5UQ` "Will Mark Sanford win his congressional race?" | Sanford is not on the Nov 3 ballot (inventory: Honeycutt (R), Lacore (D), Reeside (L)); a candidate-binary that would resolve NO; SC-1 is not among the 87 |
| Arkansas `shlnZcOUsq`                                             | any-district, multi-race                                                                                                                                   |
| Speaker-candidate market (LA-4)                                   | not a race market                                                                                                                                          |
| WAR-candidate markets (GA-3, GA-14)                               | not a race market                                                                                                                                          |

## 7. Subsidy recommendations

Portfolio subsidies appear once per contract. They are repeated on each race object; dedupe by `contractId`.

| Contract                    | Amount | Reason                                                                                                        |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `NZuO50NCLg` TheDucksFan TX | 1,900  | 25/answer and 5 bettors across the 26 kept districts; safe-R answers carry about 2.9 phantom Democratic seats |
| `cN025dzLdO` FL portfolio   | 1,350  | 25/answer and 3 bettors; FL-7/14/22/25 answers each have under 15 volume                                      |
| `SRynqNSuEL` Jack1 TX       | 1,200  | doubles depth for the 9 switched districts; the creator asked for liquidity (`spcn0gjnz4r`)                   |
| `RZSnU2csSI` NC-9           | 900    | clear proposition with active trading, 101 liquidity                                                          |
| `65ShsdN2Oh` KY-6           | 800    | after the creator states how a third-party win or replacement resolves                                        |
| `EyzOtEtsgP` GA-1           | 400    | right shape, 100 liquidity                                                                                    |

No subsidy proposed for:

- the original market (50k).
- AL-2 (1,000) and NC-11 (2,000).
- TN-9, until it is fixed.

## 8. Needs-creation (10)

Every link for these races is off-proposition. Suggested shape: a party multi (D / R / Other) that resolves on the final round, or an answer in a Dem-win portfolio.

| Priority         | Races                                            |
| ---------------- | ------------------------------------------------ |
| Moderate         | GA-2 (D+4)                                       |
| Low–moderate     | LA-6 (open, R+16)                                |
| Low (safe seats) | DE-AL, GA-3, GA-14, KY-4, LA-1, LA-4, OK-5, SC-6 |

Louisiana markets must follow §4. These races can be folded into the step that handles the unlinked districts.

## 9. Method notes

- **Answer parsing:** `parseHouseAnswer` / `buildRaces` from `web/components/usa-map/election-map-model.ts` was ported to Python and run against all 87 South answers in the four portfolios. All parse correctly. Florida (30 EV, so 28 seats) and Texas (40 EV, so 38 seats) bound-check correctly.
- **Public API reads:** comment documents for `sqUzOZN8Cs` and `SRynqNSuEL`, to resolve empty-text comments; markets `dhdspq8ISp`, `yNqLI9gPuZ`, `nAgpZAq5UQ` and `shlnZcOUsq`, which were not in the snapshot.
- **Web checks:** Louisiana format, Fla. Stat. 101.151(7), and FL-20 / TX-23 special-election status. All are secondary sources except the statute.
- **Images not read:** the two FL-6 Fine-binary description images (`c9OzIZQ2cP.jpeg`, `uUngL9g9Nn.jpeg`). Only their text portion is quoted.
- **Liquidity terms used:**
  - "perAnswer" is the stored answer `totalLiquidity`.
  - "k" is the answer pool constant √(YES·NO).
  - "limitDepth" is remaining mana vs balance-funded mana.
