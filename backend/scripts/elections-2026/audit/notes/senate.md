# Senate audit: narrative notes (35 races + chamber control)

Snapshot: prod DB 2026-10-03 00:50–00:58 UTC (dossiers / markets.json). PR #4114 read at `C:/Projects/manifold-wt-elections-audit`. Read-only throughout.

**How to read the liquidity numbers.** For every source I report three things separately:

1. **Pool liquidity**: the contract's `totalLiquidity`.
2. **Per-answer liquidity**: each answer's `totalLiquidity` field.
3. **Live limit depth**: remaining mana / balance-funded mana by answer and side.

I also add **pool k**, which is √(poolYES·poolNO) per answer (Y^p·N^(1−p) for binaries). It is a descriptive depth measure, not a trade simulation. The per-answer liquidity field is stale on several markets. For example, the TX kl938 field shows 35.4 per answer while its real pool k is about 3,464, and KS shows 35.4 against k≈570. Read pool k as the real AMM depth.

## Decisions at a glance

| decision                      | count | races                                                                                                                                                                                                  |
| ----------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| keep-current                  | 30    | AL, AR, CO, DE, GA, IL, **IA** (conditional), KS, KY, LA, MA, **MI** (conditional), MN, MS, **MT** (conditional), NE, NH, NJ, NM, NC, OK, OR, RI, SC, TN, **TX** (conditional), VA, WV, WY, FL‑special |
| switch                        | 3     | **AK** → `hPnINuRzt8` (conditional); **ME** → `RcL0Q9O0EU` (needs binary-orientation support); **OH‑special** → `Eg96Z2066n`                                                                           |
| add-override                  | 2     | **SD** (count Bengs answer as independent, not D); **ID** (drop the `otherParty: Democratic Party` fold, conditional)                                                                                  |
| needs-creation / out-of-scope | 0     | —                                                                                                                                                                                                      |

Confidence: 29 confirmed, 6 conditional (AK, ID, IA, MI, MT, TX).

---

## (a) Iowa: verifying the fix (`I9QNz9Q2L2`, slug `who-will-win-the-2026-united-states-u09U0PqQSn`)

**The fix's numbers check out.**

|                             | Plant `I9QNz9Q2L2` (PR source now)                                                                         | prior `zncyEduLg6` (`which-party-will-win-the-2026-iowa`) |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| pool liquidity              | 10,000                                                                                                     | 100                                                       |
| per-answer liquidity        | `p2LLUsgOu6` 5,000 · `ldIP8EnhtN` 5,000                                                                    | 35.4 ×3                                                   |
| pool k                      | 5,000 / 5,000                                                                                              | ≈35 per answer                                            |
| live limit depth            | Turek YES: 4 orders, 6,115 funded @0.39–0.42. Turek NO: 4 orders, 3,278 funded @0.46–0.48. None on Hinson. | Turek YES: 45 @0.28                                       |
| volume / bettors / last bet | 48,936 / 40 / 2026‑10‑02 22:07                                                                             | 8,898 / 74 / 2026‑10‑02 17:29                             |
| prices                      | Turek 0.448 / Hinson 0.552                                                                                 | Turek(D) 0.46 / Hinson(R) 0.54 / Other 0.000              |

**Description (image only).** The description contains a single image: `https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2Fdefault%2F0hR5RCNhQg.png?...`. I opened it via WebFetch and read it. It is a screenshot of a poll table headed **"Iowa General Senate Election"**, with tabs _General / Republican Primary / Democratic Primary / Nonpartisan Primary_. It lists:

- **Echelon Insights (NetChoice), Apr 3–9, 377 LV:** Wahls 46 / Hinson 44; Turek 46 / Hinson 45 (added Apr 21).
- **GBAO (Moderate Democrats PAC), Mar 10–16, 1,200 LV:** Hinson 47 / Turek 43; Hinson 47 / Wahls 44 (added Apr 13).
- **Change Research, Jan 8–11, 1,108 LV:** Hinson 44 / Turek 41; Hinson 44 / Wahls 41 (added Feb 20).

**There is no resolution text anywhere in the description.**

**Comments (all of them, 2 total):**

- `0f1hn9usff4` **@Plant (CREATOR)**, 2026‑06‑04: "…there's no incumbent… With the primary over and candidates now determined, I've created a high liquidity market for it." This is motivation only. It contains no rules.
- `sxwgdwyta6` @Jack1 (not the creator): empty text, with no image in the snapshot.

**This market has only two named candidates and no Other answer.** The answers are `p2LLUsgOu6` "Josh Turek (Democrat)" and `ldIP8EnhtN` "Ashley Hinson (Republican)". `addAnswersMode = DISABLED` and `shouldAnswersSumToOne = true`. It is a candidate market, not a ballot-party market. Scenarios the market does not cover:

- **Replacement.** If Turek or Hinson withdraws, dies or is disqualified and the party substitutes a nominee, there is no answer for the substitute and no stated rule. The likely outcomes are an N/A or a creator call. The PR would keep booking the "Turek"/"Hinson" probabilities as D/R right up to that event. If the market is then cancelled, `electionOdds()` returns `undefined` for `resolution === 'CANCEL'`, so Iowa goes **unpriced** on election night.
- **Withdrawal after ballots are fixed.** The name stays on the ballot. If the withdrawn candidate still wins the count, nothing in the market addresses it.
- **Third party / write-in.** Libertarian **Thomas Laehn** qualified for the November ballot (inventory; confirmed by [Iowa Public Radio](https://www.iowapublicradio.org/political-news/2026-08-18/iowa-u-s-senate-candidates-state-fair-soapbox)). A Laehn or write-in win has no answer, so the outcome is unspecified, with N/A the likely result. The probability is negligible, but the gap is structural.
- **Recount, certification vs media call, cancellation:** all unspecified.

**How the PR counts it.** The PR's tag regex `/\(\s*D\s*\)/` and `/\(\s*R\s*\)/` does **not** match "(Democrat)" or "(Republican)". The PR still counts the answers as parties, through the broader `/democrat/i` and `/republican/i` tests in `isDemocraticAnswer` / `isRepublicanAnswer`. So Turek's 0.448 is booked as D, Hinson's 0.552 as R, and other = 0.

Because the "(D)"/"(R)" tag test fails, `isCandidateLabelledAnswer()` returns false. As a result:

- no party/candidate note is shown;
- the explorer's text "check the market description for how other winners or replacement candidates are handled" points at a poll screenshot with no rules;
- the IA candidate card is the same contract, so it is suppressed.

**Verdict: keep (conditional).** The people are right, the prices agree with the party markets (TheDucksFan `gNIAzC6ZsL` D 0.443; kl938 0.46; jks 0.44), and the depth is excellent. Three follow-ups:

- Label Iowa in the UI as a candidate market counted as party.
- Ask Plant to add text rules for replacement, a Laehn or write-in win, and recounts.
- If the PR wants a true ballot-party source instead, the only option is `gNIAzC6ZsL` (Republicans/Democrats, no Other, k≈96), which would need a subsidy.

---

## (b) Alaska

**Ballot (verified).** Top-4 general with RCV. The four candidates are:

- Mary Peltola (D)
- incumbent **Dan S. Sullivan** (R), listed as "Sullivan, Dan S." "(Registered Republican) Incumbent"
- **Dan J. Sullivan** (R), allowed on by the Alaska Supreme Court ([ADN 2026‑06‑29](https://www.adn.com/politics/2026/06/29/alaska-supreme-court-rules-that-dan-j-sullivan-can-appear-on-the-ballot-against-sen-dan-sullivan/), [Alaska Beacon](https://alaskabeacon.com/2026/06/29/alaska-supreme-court-rules-dan-j-sullivan-eligible-to-run-for-us-senate/))
- Gerald Heikes (R), who advanced after 4th-place David Leslie (D) withdrew ([ADN 2026‑09‑01](https://www.adn.com/politics/2026/09/01/alaskas-4th-place-us-senate-finisher-drops-out-elevating-gop-candidate-to-ballot/); [Ballotpedia](https://news.ballotpedia.org/?p=51100))

Primary shares: Peltola 49.5, Dan S. 41.4, Dan J. 2.5. Alaska has no party nominees, so "party" can only mean the registration printed on the ballot.

**Does Plant's `ULun8EOAAn` unambiguously mean the incumbent?** Only once the comments are included.

- The **title** says "win **re-election**", which implies the incumbent.
- The **description** says only "resolves YES if Dan Sullivan wins the general election… NO if any other candidate wins", with no middle initial. It was written 2026‑01‑01, before the namesake filed. On its own it is ambiguous now.
- The **creator** settled it in `e4tzmrmydy` (2026‑09‑03), replying to Quroe's `sw7505gplwd` "Can it be anybody that goes by the name Dan Sullivan…": "guys it says in the title 're-election', the fake Dan Sullivan would not be getting re-elected…".
- **Result:** YES = incumbent Dan S. Sullivan personally; NO = any other winner.
- Plant's earlier creator comment `rsjdguxi29` (2026‑01‑20) loosely calls it "this market (about whether a Republican will be re-elected in Alaska)". That is informal framing, not a rule, and the written "NO if any other candidate wins" contradicts it. It is exactly why someone might misread the market.

**Why the PR must not read its YES as "Republican wins":**

1. NO includes **two other Republicans on the same ballot**, Dan J. Sullivan and Heikes. Either one winning resolves this market NO. The PR's binary path (`electionOdds`: YES→`rep`, NO→`notRep`, displayed as "Not R") would then show a Republican win as "Not R" and book it outside the R total.
2. YES is a **person**. In top-4 RCV there is no party nominee to substitute, so if the incumbent withdrew or died after certification, any Republican winner still resolves NO.
3. The PR's binary rule is "YES = Republican". Applying it here silently turns a candidate-binary into a party claim the market never made. The numerical gap is small (the other Republicans are long shots), but the labels on the dashboard would be wrong.

**Every Alaska option.** Pool liquidity, per-answer liquidity and live limit depth are reported separately.

| market                                                        | proposition                                                                                                                                                                                                                                                                                                                                                         | pool liq        | per-answer liq (field) | pool k                           | live limit depth                                                                  | price                       | verdict                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------- | -------------------------------- | --------------------------------------------------------------------------------- | --------------------------- | ------------------------------- |
| `0L8uQURR06` kl938 "Which party…" (PR current)                | party title, answers relabelled "Mary Peltola (D)" `PlyNQRgP2g` / "Dan Sullivan (R)" `nSqcNyOyNz` / "Other" `Qu8NyOCANu`; empty description                                                                                                                                                                                                                         | 200             | 35.4 / 35.4 / 35.4     | 67 / 67 / 36                     | Peltola YES 2 orders 5,537 funded @0.69–0.70; Sullivan NO 2 orders 100 @0.49–0.54 | D 0.70                      | conditional fallback            |
| **`hPnINuRzt8`** TheDucksFan "What Party…"                    | party: "Republicans" `IUORqRPncC` / "Democrats" `OdPQQynnqd` / "Other" `cI2yZnOAqL`; empty description                                                                                                                                                                                                                                                              | 100             | 35.4 / 35.4 / 35.4     | 35 / 35 / 35                     | none                                                                              | D 0.677 · R 0.320 · O 0.003 | **recommended + 2,500 subsidy** |
| `ULun8EOAAn` Plant                                            | candidate-binary (incumbent)                                                                                                                                                                                                                                                                                                                                        | 1,000           | n/a (binary)           | ≈1,001 (Y 1,644 / N 398, p 0.65) | YES 2 orders 2,043 @0.25–0.31; NO 4 orders 5,053 rem / 5,039 funded @0.32–0.66    | Sullivan 0.31               | related-only (labelled card)    |
| `D860ef2e7b` copy                                             | candidate-binary                                                                                                                                                                                                                                                                                                                                                    | 100             | n/a                    | 100                              | none                                                                              | 0.29                        | rejected                        |
| `Aups80Qgpy` answer `R9C2Cd58C9` "Mary Peltola - 2026 Alaska" | candidate-win (independent multi; "Doesn't matter what their party registration is")                                                                                                                                                                                                                                                                                | 6,250 (shared)  | 25                     | ≈390                             | none                                                                              | 0.70                        | related-only                    |
| `zdpStsE6L9` answer `ERhqpI5Rq5`                              | Nate Silver polling lead                                                                                                                                                                                                                                                                                                                                            | 12,000 (shared) | 1,000                  | 1,000                            | none                                                                              | 0.78                        | rejected                        |
| `uP5ZLAIENg`                                                  | Dan J. finishes 3rd                                                                                                                                                                                                                                                                                                                                                 | 1,000           | n/a                    | —                                | YES 5,000 @0.80                                                                   | 0.87                        | related-only                    |
| combined / derivative                                         | `LNP9dQLcQL` (ME+AK, 1,000; YES limit 10,079 rem / 9,607 funded @0.37–0.60) · `qyhz5Zu0yP` (1,048) · `gLOgSOZStO` (1,000) · `Lp629u9g2C` (1,000) · `Rn98uRqlS5` (1,000; YES 2,030 @0.41–0.50) · `5ZI9Sncpt8` (110) · `2zS8qEZp99` (100) · `UgEgyQpId0` (250) · copies `D6ecb08a92`/`Db5fb6d9c9`/`D842b61798` (100) · `EUtsIpA0Zl` vote % · `zIgZynLCpL` call timing | —               | —                      | —                                | —                                                                                 | —                           | rejected                        |

**Recommendation.** Use a **party source** for the map and totals, and switch to `hPnINuRzt8` with a **2,500-mana subsidy**. No deeper party market exists. The current kl938 market is the deepest party market, but its answer text "Dan Sullivan (R)" is the one label that collides with the two-Dan-Sullivan ballot. It also has no description and a silent creator, so its party reading rests on the title alone. TheDucksFan's answers name only parties, so the collision cannot reach the dashboard.

If the PR prefers to keep `0L8uQURR06` (86 bettors and the Peltola limit book), it should first get creator or moderator text saying the market resolves to the winner's ballot party and that any Republican, including Dan J. Sullivan and Heikes, resolves "Dan Sullivan (R)".

Plant's binary can be shown as a separate card labelled "Incumbent Dan S. Sullivan wins? (NO = any other winner, incl. two other Republicans)" and **never counted in party totals**. Note that the explorer hides candidate cards whenever the main source has "(D)/(R)" labels. With `hPnINuRzt8` as the main source, the card would show.

---

## (c) Other competitive sources

Prices are D unless noted. "Deeper equivalent" means an existing market with the same or better proposition and more depth.

| race       | PR source                                                                              | pool liq | per-answer liq field | pool k               | live limit depth                                                                            | price                     | deeper equivalent / decision                                                                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------- | -------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GA         | `cOqt565CRZ` (PredictIt-style ballot-party rules)                                      | 500      | 50 / 50              | 139                  | Democratic YES 7 orders 32,581 rem / **600 funded** @0.50–0.95; NO 5                        | 0.96                      | none deeper for party (Vortex `qh12ksks6r` is a candidate multi, Ossoff k≈354). **Keep, confirmed.** Runoff is covered by "wins the 2026 election" and a 12‑31 close.                                                                                                                               |
| MI         | `Ad6z6OsuQ5` kl938 (candidate-tagged + Other)                                          | 100      | 35.4 ×3              | 35                   | El-Sayed YES 8 orders 9,762 funded @0.40–0.62; Rogers YES 3,116 @0.01–0.30; El-Sayed NO 100 | 0.70                      | `gOA9OOugh2` (clean labels, no Other) k≈95; Jack1 `n2E2I0I6cS` is a candidate binary (primary leg already won), k≈4,998, not party. **Keep (conditional) + 2,500 subsidy.**                                                                                                                         |
| NC         | `9EALhuO9dp`                                                                           | 200      | 50 / 50              | 88                   | Republicans NO 4 orders **81,000 funded** @0.04–0.08                                        | 0.964                     | `AgZPINnud0` binary YES=D (100 liquidity; needs orientation override). **Keep.**                                                                                                                                                                                                                    |
| ME         | `UzNUOlCZgt` (candidate-tagged + Other)                                                | 100      | 35.4 ×3              | 35                   | Jackson YES 6,331 @0.50–0.61; Collins YES 140; Jackson NO 57                                | 0.62                      | **`RcL0Q9O0EU`** Jack1 binary: "winning candidate appears on the ballot as the Democratic Party candidate"; 10,000 liquidity, k≈9,978, 85 bettors, limits ~10 YES / 1 NO; price 0.636. **Switch, but YES=D** (see PR-wide 1). If not switched: subsidize the current source by 2,500.               |
| NH         | `lRd6Sz0dC8` (creator: third-party win → N/A, `wi1dn4lg8jj`)                           | 200      | 50 / 50              | 96                   | Republicans NO 2,562 rem / 30 funded                                                        | 0.87                      | Jack1 candidate multi `6lzI60gN6S` k≈354 (candidate). **Keep + 1,000 subsidy.**                                                                                                                                                                                                                     |
| OH‑special | `9cghzyIpRP` ("Jon Husted (R)"/"Sherrod Brown (D)", no Other)                          | 200      | 50 / 50              | 96                   | Husted YES 1,611 @0.41                                                                      | 0.59                      | **`Eg96Z2066n`** "What party will win the special election to fill JD Vance's Senate seat?" with Democratic/Republican/Other; 1,000 liquidity, 353.6 ×3, k≈354, no limits, stale since 2026‑09‑01 (D 0.564). Confirmed special. **Switch.** Also SemioticRivalry binary `a5msrfv2ta` YES=D k≈1,001. |
| TX         | `tdA9NqRnpZ` kl938                                                                     | 10,600   | 35.4 ×3 (stale)      | 3,464 / 3,466 / 67   | Talarico YES 1,800 @0.51–0.61; NO 800 @0.66–0.75                                            | 0.633                     | Jack1 binary `SyhgEZC68s` "Democrats win" k≈10,120, 330 bettors, YES=D. **Keep (conditional)**: party reading relies on @Gen's non-creator `f4h2spr5wjr`.                                                                                                                                           |
| IA         | `I9QNz9Q2L2`                                                                           | 10,000   | 5,000 ×2             | 5,000                | see (a)                                                                                     | 0.448                     | see (a). **Keep (conditional).**                                                                                                                                                                                                                                                                    |
| AK         | —                                                                                      | —        | —                    | —                    | —                                                                                           | —                         | see (b). **Switch to `hPnINuRzt8` + subsidy.**                                                                                                                                                                                                                                                      |
| NE         | `6I5SSguQ8I` ("As identified on the ballot, regardless of how they eventually caucus") | 1,000    | 288.7 ×4             | 289                  | Republican YES 2,827 rem / **0 funded**; Osborn YES 66 @0.20–0.24                           | R 0.72 / Osborn 0.28      | none deeper with a party proposition (Plant `U68sLtsCyP` is an Osborn candidate binary). **Keep, confirmed.** Osborn counts as other.                                                                                                                                                               |
| MN         | `QcRNIRZSNg`                                                                           | 200      | 50 / 50              | 100                  | R NO 11,785 and D YES 8,953, **both 0 funded**                                              | 0.93                      | candidate card `25l69Up5Z0` is fine. **Keep.**                                                                                                                                                                                                                                                      |
| MT         | `tydQt5d26u` candidate multi with (D)/(I)/(R)/Other                                    | 2,000    | 28.9 ×4              | 171 / 278 / 330 / 96 | Bankhead NO 25,000 @0.01; Alme YES 1,000 (0 funded)                                         | Alme 0.923 / Bodnar 0.068 | party market `Sl9uh59lRQ` N/As on a Bodnar win (`fbbea25iaft`), so it is rejected. **Keep (conditional).**                                                                                                                                                                                          |
| ID         | `NLt0U0pC9n` "Jim Risch (R)"/"Todd Achilles (I)"                                       | 1,700    | 50 / 50              | 254                  | none                                                                                        | Achilles 0.073            | none. **Add override:** stop folding Achilles into D.                                                                                                                                                                                                                                               |
| FL‑special | `CcysACRQAh` ("remaining 2 years of that term")                                        | 1,000    | n/a                  | 1,000                | none                                                                                        | R 0.886                   | Jack1 `CqdgAg2zsU` YES=D k≈1,711. **Keep, confirmed** (YES=R matches the PR).                                                                                                                                                                                                                       |
| IL         | `n8czNPuEOU`                                                                           | 200      | 50 / 50              | 80                   | none                                                                                        | 0.98                      | **keep**                                                                                                                                                                                                                                                                                            |
| VA         | `tgPtN825A2`                                                                           | 300      | 50 / 50              | 106                  | R NO 393 (0 funded)                                                                         | 0.97                      | **keep**                                                                                                                                                                                                                                                                                            |
| NM         | `cZIqAcCZ05`                                                                           | 200      | 50 / 50              | 83                   | none                                                                                        | 0.98                      | **keep**                                                                                                                                                                                                                                                                                            |
| KS         | `nZsucEQ8gQ`                                                                           | 2,600    | 35.4 ×3 (stale)      | 563 / 574 / 123      | D NO 50 @0.40                                                                               | 0.35                      | **keep, confirmed**                                                                                                                                                                                                                                                                                 |
| SC         | `LsEpnppAcc`                                                                           | 1,000    | 353.6 ×3             | 354                  | R YES 100 @0.78                                                                             | R 0.857                   | **keep, confirmed**                                                                                                                                                                                                                                                                                 |

## PR-wide findings (affect several races)

1. **Binary orientation.** `electionOdds()` treats every Senate binary's YES as Republican. The deepest ballot-party markets in ME (`RcL0Q9O0EU`), TX (`SyhgEZC68s`), OH (`a5msrfv2ta`), FL (`CqdgAg2zsU`) and NC (`AgZPINnud0`) are YES = Democrat, so they cannot be used without a per-source flag (e.g. `binaryYes: 'dem'`).
2. **Candidate binaries can never be party sources**, whatever the flag. This covers AK `ULun8EOAAn`, MI `n2E2I0I6cS`, NE `U68sLtsCyP`, MT `zdhZqRILh6` and SC `USzU5SECSq`.
3. **SD over-counts Democrats.** `sshNUOnpCZ` answer `9zNRu0RANh` reads "Democrats OR Independents". The creator turned it into the Brian Bengs (I) option (`ephwy885m2` "Done!" replying to `0m51sc9s578l`). `isDemocraticAnswer` books it as a D win; it should count as other.
4. **ID `otherParty: 'Democratic Party'` invents an affiliation and is applied inconsistently.** `getPartyProbs` (homepage map and toss-ups) folds Achilles into D, while `electionOdds` (explorer and seat totals) does not. Nothing in the evidence says Achilles would caucus with Democrats.
5. **Latent bug in the ME candidate card.** `who-will-maines-us-senate-election` (`66g2hSPynI`) shows Collins at 0.99 because it N/As unless Platner, Mills or Collins wins (creator `b1w004pnjwk`). Today it is hidden only because the ME party source has "(D)"/"(R)" labels. Remove it from `senateCandidates2026` before any ME source change.
6. **The party-panel note claims a rule nobody stated.** For "which party" markets with "(D)/(R)" answer labels (AK current, MI, TX, ME current, OH current, ID), the note says they "resolve on PARTY regardless of who the nominee turns out to be". No creator has said that for any of them. The only statement is @Gen's non-creator `f4h2spr5wjr` on the TX kl938 market ("…and some others like it").
7. **Missing Other answers.** Many safe-seat TheDucksFan markets have no Other answer although independents or minor parties are on the ballot (CO, IL, MA, MS, NJ, OK, OR, RI, TN, NC, MN, KY). TheDucksFan's stated policy on sibling markets is N/A when a third party wins (NH `wi1dn4lg8jj`, MT `fbbea25iaft`, ID `dg26m3e20wa`). The risk is negligible, so no change is recommended.

## Cross-state portfolio `which-us-senators-and-candidates-wi` (`Aups80Qgpy`) and similar

**Rules.** "The named candidate must win the named election… Doesn't matter what their party registration is when they win… Market can resolve early if it's no longer possible for them to win." It is an independent multi (sumToOne = false); contract liquidity is 6,250, there are no limit orders, and the creator added answers.

**Each 2026 answer is a clean candidate-win proposition for one race** (YES = that person wins; NO = anyone else). Pool k is shown in parentheses:

- `R9C2Cd58C9` Peltola AK (≈390)
- `pgRNut052n` Brown OH (≈414). This must be the Class‑3 special, the only Ohio Senate contest in 2026.
- `9tRlZLpPuQ` Talarico TX (≈380)
- `y2d0Ulu9gA` El Sayed MI (≈414)
- `AZ6Ss5hC6c` Moody FL (≈411; the special)
- `ZsLlhsUINQ` Osborn NE (≈476)
- `SU92ZQ8n9E` Cooper NC (≈372)
- `uZnL2cuu9R` Ossoff GA (≈101)
- `LAO9uq0cO6` Markey MA (≈101)
- `66uqCEgZy6` Turek IA (≈100)
- Graham SC `y8qIZ2sdsZ` and Platner ME `0A98t2s8nL` are already resolved NO.

**None is a party proposition.** Party is explicitly irrelevant, and a substituted nominee does not inherit an answer (Platner's resolved NO; nothing carried to Jackson). They are fine as candidate references but unsuitable for party totals. The PR already ignores independent multis for state races.

Similar markets, all **rejected as race sources**:

- `zdpStsE6L9`: Nate Silver polling lead on election day; Democratic answers follow replacements.
- `QdE5snN2yy`: whether the winner's party controls the Senate.
- `dlc0SngLqP`: conditional on a D majority.
- `nL25Igpqqc` / `QqP0EUZdOy`: vote-share bands.
- `RAq5AALQSd`: tipping point.
- `gRLS9PP9h9` / `NqyztcAuE0`: WAR.

---

## (d) Senate control: `will-republicans-win-the-senate-in-738388924521` (`BpoEJNtlQoDBpfjBmK0y`, AndrewG)

**Market.** Binary, created 2022‑12‑08, **close 2026‑12‑01 04:59 UTC**. Pool liquidity 20,005; volume 239,066; 541 bettors; P(YES = R) 0.354. Live limits: NO 33 orders, 8,302 rem / 7,850 funded @0.38–0.78; YES 8 orders, 1,539 @0.10–0.30.

**Full description (verbatim):** "Resolves YES if after the 2026 United States elections members of the Republican party have won at least 51 seats in the Senate, or 50 seats with a Republican Vice President for tie-breaking purposes. Resolves NO otherwise. If a politically independent/third-party senator is elected, they would count as a Republican for the purposes of this market if they are widely expected to caucus with the Republican party."

**Creator updates and comments.** There are none. AndrewG has posted nothing among the 19 comments and the description has no update block. The relevant question was asked and never answered: `8aogg3i7lui` (@Jack1, 2026‑02‑11), "when do you decide to resolve? If a republican changes to caucus with dems on 30 November will that mean democrats win if it takes them from 50 to 51". Another non-creator comment, `4yky6n6acjr` (@brianwang), only speculates about Fetterman crossing over at 49R–51D. **Neither silence nor the title is a ruling.**

**Election results or later control?** The text is framed on **election results**: "after the 2026 United States elections", seats "won", independents counted if "widely expected to caucus". It says nothing about the time at which party membership is measured, post-election switches, vacancies, or when the market will be resolved.

**Scenario: Democrats win 51 seats, then Fetterman switches party on Dec 30.**

- After the switch the Senate would be 50 R + 50 D, and VP Vance's tie-break gives Republicans control on Jan 3, 2027.
- On the natural reading, Democrats won 51 and Republicans did not reach 51 or 50+VP "after the 2026 elections". That resolves **NO**.
- The switch happens **after the market's close (Dec 1)**. If AndrewG resolves promptly on results, it is irrelevant.
- But membership is measured at no stated time. A resolver waiting past Dec 30 could argue that Fetterman is then a "member of the Republican party" holding a seat he "won" (in 2022), which gives 50 + VP and **YES**.
- **Verdict: ambiguous, leaning NO.** The PR should not present it as "control on Jan 3".

**Alternatives with explicit cutoffs:**

| market                                                       | rule / cutoff                                                                                                                                                                                                                                                                                                                    | Fetterman Dec‑30 switch →                        | depth                                                                                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upscnQcUqt` predyx "Who controls Congress…"                 | Control = majority or 50 + VP. Affiliation is ballot listing or "clearly identifiable public affiliation **at the time the 2026 midterm results are called**". Independents count by declared caucus intent. If unclear, the first Majority Leader elected decides. Resolves when AP, Fox and NBC have all called both chambers. | ignored → **D Senate**                           | 5,000 liq, 99,584 vol, 203 bettors. Senate-R marginal = "Republicans Sweep" 0.058 + "R Senate, D House" 0.290 = 0.348. Multi answer, so the ControlCard cannot read it as-is. |
| `PlRCt0hEEl` Panfilo Dem seat count                          | "By default… resolve on **January 4th, 2027**"; independents count by caucus; resolution delayed if unclear                                                                                                                                                                                                                      | counted → **50** (no D majority)                 | 12,000 liq, 61,637 vol                                                                                                                                                        |
| `sRp5N5utgz` Tripping (cumulative mirror of Panfilo)         | Follows Panfilo's resolution; answer `6PcSsnulOP` "At least 51" = 0.590                                                                                                                                                                                                                                                          | counted → NO on 51                               | 1,000                                                                                                                                                                         |
| `2qgcn2s2zd` MichaelBlume                                    | YES if **at any time before Jan 31 2027** both the Speaker and the Majority Leader are registered Democrats                                                                                                                                                                                                                      | counted → NO (R leader); combined with the House | 10,000                                                                                                                                                                        |
| `yhnShlh02n` Jack1 (Polymarket mirror)                       | First announced Majority Leader from the majority party; open to Jan 3 2027                                                                                                                                                                                                                                                      | counted → R leader                               | 1,100                                                                                                                                                                         |
| `s8uqRyg2U0` DannyOBrien (conditional, not a control market) | D total ≥ 51, counting 2026 winners plus senators "**serving on Election Day, November 3, 2026**"; independents only if committed before Election Day; 50‑50 does not count                                                                                                                                                      | ignored (Fetterman D on Nov 3)                   | 6,000                                                                                                                                                                         |
| `5Pdd89NRyO` Brenner                                         | 51+ seats, certified results. The 50‑50 question (`ifdbzbcl36g`, `fnfwf10wp1n`) is unanswered; creator says "both independents caucus with dems" (`wn1o9sg04x`).                                                                                                                                                                 | unspecified                                      | 100                                                                                                                                                                           |
| `V7rZgl3HtYGVpDAiPAVV`                                       | Creator account deleted; no rules (EvanDaniel's proposal `kdlyketbjgb` is not a ruling)                                                                                                                                                                                                                                          | unspecified                                      | 1,000                                                                                                                                                                         |
| `hS5cg06hdz` MarcoMar (YES=D)                                | ≥ 51 seats; election cancelled → NO; no time stated                                                                                                                                                                                                                                                                              | unspecified                                      | 100                                                                                                                                                                           |
| `IRPN9glOnZ`                                                 | "certified by the Senate"; the 50‑50 question (`r2xgro1ubjb`) is unanswered                                                                                                                                                                                                                                                      | unspecified                                      | 100                                                                                                                                                                           |
| `0q6n8s9qzI`                                                 | Verbatim copy of AndrewG's text                                                                                                                                                                                                                                                                                                  | same ambiguity                                   | 100                                                                                                                                                                           |
| `NAhcQsAQgu`                                                 | Panel of human judges                                                                                                                                                                                                                                                                                                            | discretionary                                    | 100                                                                                                                                                                           |

**Recommendation.** Keep `BpoEJNtlQoDBpfjBmK0y` as the headline source; it is by far the deepest, and its 50+VP framing matches the PR's seat-bar text. Label it precisely: "Republicans win ≥51 seats, or 50 + VP, in the 2026 elections (market text; post-election party switches not addressed)". Ask AndrewG to answer `8aogg3i7lui`.

If the dashboard means "who organizes the Senate on Jan 3", none of the deep binaries says that:

- predyx `upscnQcUqt` is the explicit **call-time** alternative.
- Panfilo `PlRCt0hEEl` and MichaelBlume `2qgcn2s2zd` are the explicit **post-switch** (Jan 4 / Jan 31) alternatives.

One more edge case: if Osborn wins and caucuses with neither party, a 50 D / 49 R / 1 I Senate makes AndrewG's market NO, and the ControlCard would paint it D.

---

## Sim targets

`out/sim_targets.json` lists 30 contracts. For multi-choice markets `answerIds` holds every unresolved answer; for binaries it is `[]`. It covers:

- every Alaska option (including the portfolio Peltola answer);
- Iowa: the PR source, the party alternative and the prior source;
- ME, MI, TX, OH current and recommended sources;
- NE, KS, NH, NC, GA, MN, MT, ID, FL, SC, SD, IL, VA and NM;
- the control binary.

I did not compute any trade outcomes.

## Web sources used

- [ADN: Alaska Supreme Court rules Dan J. Sullivan can appear on the ballot](https://www.adn.com/politics/2026/06/29/alaska-supreme-court-rules-that-dan-j-sullivan-can-appear-on-the-ballot-against-sen-dan-sullivan/)
- [Alaska Beacon: Dan J. Sullivan eligible](https://alaskabeacon.com/2026/06/29/alaska-supreme-court-rules-dan-j-sullivan-eligible-to-run-for-us-senate/)
- [ADN: 4th-place finisher drops out, Heikes elevated](https://www.adn.com/politics/2026/09/01/alaskas-4th-place-us-senate-finisher-drops-out-elevating-gop-candidate-to-ballot/)
- [Ballotpedia news](https://news.ballotpedia.org/?p=51100)
- [Iowa Public Radio: Iowa U.S. Senate candidates at State Fair (Laehn on ballot)](https://www.iowapublicradio.org/political-news/2026-08-18/iowa-u-s-senate-candidates-state-fair-soapbox)
- Iowa description image (read via WebFetch): `firebasestorage…/user-images%2Fdefault%2F0hR5RCNhQg.png`
