# California same-party contests and Alaska at-large: deep dive

Audit date 2026-10-03. Market facts come from the read-only prod snapshot (2026-10-03 00:50–00:58 UTC), plus a public-API re-check of comments the same day (no new creator comments on any market below). PR code was read at `C:/Projects/manifold-wt-elections-audit` (branch `codex/elections-map`). Nothing was written anywhere except the two output files.

## 0. Sources used

| Fact                                                              | Source                                                                                                                                                                                                                                                                                           | Status                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| CA Nov 3 finalists and party preference, all 52 districts         | **CA SOS Certified List of Candidates, General Election Nov 3 2026, dated 8/27/2026**: https://elections.cdn.sos.ca.gov/statewide-elections/2026-general/cert-list-candidates.pdf                                                                                                                | Fetched (14.8 MB PDF) and parsed. Names and parties checked for every CA district.                                             |
| CA primary candidates and parties (to audit non-finalist answers) | CA SOS Certified List, Primary June 2 2026, dated 3/26/2026: https://elections.cdn.sos.ca.gov/statewide-elections/2026-primary/cert-list-candidates.pdf                                                                                                                                          | Fetched and parsed                                                                                                             |
| CA write-ins barred in top-two general                            | Elections Code §8606: "a person may not be a write-in candidate at the general election for a voter-nominated office" (via california.public.law, mirrors leginfo; leginfo itself timed out)                                                                                                     | Verified text                                                                                                                  |
| CA top-two, same-party allowed                                    | Elections Code §8141.5: "More than one candidate with the same party preference designation may participate in the general election"                                                                                                                                                             | Verified text                                                                                                                  |
| CA death or withdrawal after nomination                           | §8803(b): "No vacancy on the ballot for a voter-nominated office at a general election shall be filled"; a deceased candidate stays on the ballot and, if elected, the office is vacant at the start of the term. §8810: the name is printed unless death is known ≥68 days before the election. | Verified text                                                                                                                  |
| Alaska Nov ballot                                                 | Alaska Public Media, James Brooks, 2026-09-01: https://alaskapublic.org/news/politics/elections/2026-09-01/in-alaskas-u-s-house-race-a-libertarian-and-a-federal-inmate-advance-after-late-withdrawals                                                                                           | Fetched. elections.alaska.gov returned HTTP 405 to both curl and WebFetch, so the official DoE list was **not** read directly. |

## 1. Alaska at-large (AK-0): verify the `preferOverPortfolio` fix

**PR state.** `HOUSE_RACE_MARKETS` has `{district:'AK-0', slug:'who-will-win-the-alaska-house-elect', preferOverPortfolio:true}`. The model's answer-label classifier turns the snapshot into R 0.840, D 0.009, other 0.151, which shows as **"Likely R · R 84%"**. The original portfolio answer `POqOgsLs9R` (Dem-win 0.030) is hidden.

**Market `9zPhhzEnCc`** (Jack1, sum-to-one, addAnswers=ONLY_CREATOR, liquidity 1000, vol 5062, 11 bettors, last bet 10-01, no comments, no limit orders, closes 2026-11-03 23:59 UTC):

- **Final-round criteria: correct.** The description says: "winner of the election for Alaskas at large congressional districts election in November. This is for the winner of the final round, not first place the primary." Alaska Public confirms RCV is still used in November, and the race skips tabulation if one candidate has more than 50% of first choices. Certification versus media call, replacement and cancellation are all **unspecified**.
- **Bill Hill** is listed as `AzEt0Qtnu9` "Bill Hill (I)" at 0.134. Alaska Public calls him "Independent candidate Bill Hill". A search snippet says the DoE shows "Non-Partisan", but I could not verify the exact ballot designation. The PR classifies him as `other`, which is correct.
- **The answer set does NOT match the November ballot.**

| Answer ID    | Label               | p     | Ballot reality                                                                                                                       | Correct party treatment                                             |
| ------------ | ------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `AP0zQpUcug` | Nick Begich III (R) | 0.840 | On ballot, Republican                                                                                                                | R                                                                   |
| `ytQ5UsCccN` | Matt Schultz (D)    | 0.009 | **Not on ballot.** He placed 3rd (8.1%) in the primary, "suspended his campaign on July 17" and withdrew before the Aug 31 deadline. | Not D. Exclude it, or fold it into other/unknown until resolved NO. |
| `AzEt0Qtnu9` | Bill Hill (I)       | 0.134 | On ballot, independent/nonpartisan                                                                                                   | other (independent)                                                 |
| `cAALtNgyhc` | Other (isOther)     | 0.017 | Covers **Eric Hafner (D)** and **Jim McDermott (L)**, who are both on the ballot, plus any write-in                                  | other/unknown, mixed parties, cannot be split                       |

The final four were Begich, Hill, Hafner and McDermott. McDermott moved up from 8th after the Schultz, Williams (D), Strickland (R) and Reynoso (D) withdrawals.

- **Consequences in the PR.**

  1. The 0.9% "D" share belongs to a non-candidate, while the actual Democrat is counted as `other` inside Other.
  2. If Hafner won, the market would resolve to **Other** and the dashboard would record a Democratic win as "other".
  3. The creator can still add Hafner or McDermott, which would move probability out of Other.

  The numbers are small, so the leader stays R, but the D/other split from this market is not meaningful.

- **Is the override still right?** Yes. It is the only source that separates R from the independent contender, who is at 13%. The Dem/Not-D portfolio flattens Begich and Hill into "Not D 97%". It should stay as a **conditional** source, with answer-level party metadata:

  - `AP0zQpUcug` → R
  - `AzEt0Qtnu9` → other (independent)
  - `ytQ5UsCccN` → excluded/withdrawn
  - `cAALtNgyhc` → other/unknown

  Do not report a D share from this market. The portfolio's 3.0% can be shown as a separate cross-reference. Ask Jack1 to resolve Schultz NO and add "Eric Hafner (D)" and "Jim McDermott (L)".

- **Is the fallback sound?**
  - **Mechanically, yes.** `electionOdds()` returns `undefined` for a missing contract or `resolution === 'CANCEL'`. The individual source then never overwrites `priced`, so the earlier portfolio entry `POqOgsLs9R` remains. The PR test "…AK-0…" covers both the `null` and CANCEL cases.
  - **Semantically, yes.** `POqOgsLs9R` resolves on ballot-party affiliation, NYT+DDHQ calls and then certified results. For Alaska the call follows RCV tabulation, so it is a valid Dem/Not-D proposition. Hafner is the only D on the ballot.
  - **Gaps:**
    - (a) Resolution to Other is not a cancellation, so a Hafner win would not fall back. After resolution, prefer the portfolio's resolved answer when this market resolves to Other, or apply ballot-party metadata to the winner.
    - (b) If only some answers are cancelled, `electionOdds` skips them and renormalises silently.
    - (c) The two markets close at different times (Nov 3 vs Dec 2). That does not matter for correctness.

## 2. California same-party November contests: who is on the ballot

The CA SOS certified list (8/27/2026) shows **exactly nine** same-party contests. Every other district is D v R, except CA-6, which is D v No Party Preference.

| District | Finalist (party preference on ballot) | Finalist (party preference on ballot) | Type  |
| -------- | ------------------------------------- | ------------------------------------- | ----- |
| CA-4     | Eric Jones (Democratic)               | Mike Thompson (Democratic)            | D v D |
| CA-7     | Doris Matsui (Democratic)             | Mai Vang (Democratic)                 | D v D |
| CA-11    | Connie Chan (Democratic)              | Scott Wiener (Democratic)             | D v D |
| CA-12    | Jamie Joyce (Democratic)              | Lateefah Simon (Democratic)           | D v D |
| CA-14    | Melissa Hernandez (Democratic)        | Aisha Wahab (Democratic)              | D v D |
| CA-29    | Angélica María Dueñas (Democratic)    | Luz Maria Rivas (Democratic)          | D v D |
| CA-34    | Jimmy Gomez (Democratic)              | Angela Gonzales-Torres (Democratic)   | D v D |
| CA-37    | Sydney Kamlager-Dove (Democratic)     | Samantha Mota (Democratic)            | D v D |
| CA-40    | Ken Calvert (Republican)              | Young Kim (Republican)                | R v R |

Corroboration (secondary):

- TW5z0p's resolved `P66t0S9IO9` ("Which CA congressional races will advance 2 members of the same party") resolved YES for CA-04, CA-14, CA-29 and CA-37. It listed only 7 districts.
- Jack1's `E2g8AqQ5gd` ("Which party will win the CA40 House election in November?") resolved **Republicans** on 2026-06-09, after creator comment `7fdzjo0u3ds`: "multiple outlets reporting 2 republicans will advance, so democrats can't win."

Jack's list had eight; **CA-29 is real and has no market at all.** Public-API searches for "Luz Rivas", "Rivas", "Dueñas", "Duenas", "CA-29", "California 29th" and "29th congressional", plus the snapshot name search, found nothing relevant.

Key finding on precedence: **the CA portfolio `USqLR8OSCI` has 43 answers and omits exactly these nine districts**. Its creator, TheDucksFan, made it on 2026-06-16 04:50 and created the CA-40 candidate market two minutes later. So none of the nine competes with that portfolio today. The original portfolio covers only CA-40 among them, and that answer is resolved NO.

## 3. Every market per district, with round and verdict

Liquidity is the DB field. k is the √(poolYes·poolNo) pool depth. For sum-to-one markets the per-answer DB field often understates the pool (e.g. CA-7 shows 50 but k=1000).

### CA-4

- **`yZRqg50ddy`** `who-will-win-the-ca4-house-election-0suAR0A066` (Jack1). Mapped in the PR.
  - Answers: `SNIyON6Etq` "Mike Thompson (D)" 0.795 and `IEd5ECNILI` "Eric Jones (D)" 0.205. Liquidity 200 (k=97 each), 6 bettors. Closes 2026-11-03 10:59 UTC.
  - **Round is not stated.** The description is a Wikipedia link plus boilerplate: "Dashboard to find markets for other California house primaries". The same boilerplate appears on Jack1's November markets (CA-1, CA-2, CA-3), so it is not a ruling.
  - Round established by construction:
    - created 2026-09-16, after the June 2 primary was certified;
    - only the two certified finalists are listed;
    - an identical twin `CnqgRqcgqy` (an independent multi, created about a minute earlier) was cancelled at the moment this one was created, apparently a mistaken first attempt;
    - Jack1's primary market `n6QShPtnt5` ("Who will advance from the CA-4 Primary?") had already resolved on 6/13.
  - **Verdict: conditional (Nov 3 general by inference).** Ask Jack1 to state it.
- `5AdCIq06RU` (Jack1) is **explicit**: "This resolves yes to the winner of the November election. This is for the general election". It is `shouldAnswersSumToOne=false`, with 7 non-advancers resolved NO, Thompson 0.770 and Jones 0.210. The PR cannot read independent multis for one race. Conditional alternative.
- `tCAnUdAUO6` (TW5z0p): title says "general election"; empty description, untagged labels, liquidity 100, stale since 8/20. Conditional.
- `qUCO8h0NNs` is State Senate SD-4. Rejected.

### CA-7

- **`OuAAPuqpzE`** `2026-us-house-ca-7-winner` (Jack1). Mapped. "Rresolves yes to the winner in November." **Confirmed.**
  - Answers: `AEZqP5zhth` "Doris Matsui (D) (Incumbent)" 0.590 and `shNId9sNL9` "Mai Vang (D)" 0.410.
  - Liquidity 2000 (k=1000), 5 bettors.
- `0CUcss98uI` (TW5z0p): "General election for CA-07", empty description, untagged, liquidity 100. Conditional.
- `d52NQl90sz` (primary first place, resolved Mai Vang). Primary market; context only.

### CA-11

- **`8uzA88lE2A`** `who-will-win-the-2026-election-for-AndtddsLn0` (BenM). **Recommended display source.**
  - "Who will win the 2026 election for California's 11th Congressional District"; "Resolves based on the election outcome per major media calls or secretary of state. Follows the district number in the event of redistricting".
  - Liquidity 12,225, vol 184k, 65 bettors. Wiener 0.710, Chan 0.277.
  - The round is implicit: a CA top-two primary elects no one, and no special election is pending. **Conditional.**
- `RguA02RdAc` `will-scott-wiener-win-2026-house-el` (ms).
  - **Explicit**: "declared the official winner of the general election for California's 11th congressional district … scheduled for November 3, 2026"; certified SOS results.
  - p=0.714, liquidity 1000, 27 bettors, YES limit order of 50 at 0.62.
  - Use it as a confirmed cross-check, but **only with a candidate-binary presentation**. The PR's binary path reads YES = Republican and would count Wiener as R.
- `9re3xe1soLUwdOEudDno` `who-will-be-the-next-person-to-win` (barak). **Related-only.**
  - Proposition: "next elected to the office, other than Nancy Pelosi, regardless if they are ever seated. Includes special elections." Closes 2029.
  - Creator comments address scope but not the round: `65duccd588i` says Prop 50 doesn't affect it and that "next redistricting cycle" means post-2030; `j2b5dahq3g` says "Market is CA CD 11."
  - It equals the 2026 regular result only while no special election intervenes (none as of Oct 3). That is a contingency, not an equivalence, so its liquidity of 131k does not cure the scope mismatch.
  - Wiener 0.727, Chan 0.265. It is consistent with the dedicated sources.
- `AhZsN0dht5` is a conditional market (N/A unless Wiener advances). Rejected. `Ed6q9ZlPC0` is a margin market. Rejected.

### CA-12

- **`PsPO6z5zZt`** `will-jamie-joyce-win-the-2026-12th` (PhilipDowdell). **Recommended; confirmed.**
  - "resolves to YES if Jamie Joyce wins the general election for California's 12th Congressional District in the November 3, 2026, election". Withdrawal or disqualification resolves NO. Resolution uses certified SOS results.
  - p=0.040, liquidity 1000 (k=1594), 17 bettors.
  - A 150,000-mana, balance-funded NO wall at 0.04–0.09 caps Joyce.
  - Needs a candidate-binary presentation, labelled "Joyce / any other winner".
- `UyqlzUzdAQ` `2026-california-12th-congressional` (Jack1, created 10-02). Conditional fallback for when no candidate-binary UI exists.
  - Answers: `9lICQQPSZL` "Lateefah Simon (D) (incumbent)" 0.955 and `Onh5QO9udq` "Jamie Joyce(D)" 0.045. Liquidity 200 (k=61), **1 bettor**.
  - Description is only a Wikipedia link, so the round is implicit.
  - **Label parsing.** `DEM_TAG = /\(\s*D\s*\)/i` matches "Joyce(D)" with no space. `getPartyColor` gives D colour and the text is shown verbatim. No breakage. It still should not be the party basis (see §5).

### CA-14

- **`zU5S55uNOA`** `who-will-win-the-2026-election-for-chQddtRLUt` (BenM). **Confirmed** for the regular Nov 3 election.
  - Creator `x3xdmytqjoo` fixed the title, which had said 11th: "I copied from my 11th district market and forgot to change the number". Creator `cnai9n0dlbc`: "This resolves based on the regularly scheduled election, not a special election beforehand". That special was June 16; Wahab won it, per resolved `ELI88UgEc8`.
  - The description says it "Follows the district number through any redistricting".
  - Liquidity 1100, 7 bettors.
  - **All five answers are open and tradable** and must be kept: `QCp0CESZpP` Matt Ortega 0.005, `h5lCZSsnlS` Abrar Qadir 0.005, `L25ctuRCul` Aisha Wahab 0.933, `h0csOsty2h` Melissa Hernandez 0.050, `ddR2nzZlEU` Other 0.008. None has a party tag (see §5).

### CA-29

- **No market exists.** CA-29 is unpriced in the PR and not in any portfolio. It counts D by ballot composition (§6). A candidate multi is optional: "Luz Rivas (D) / Angélica Dueñas (D)", Nov 3 general, certified SOS results. Under the brief's rules it is not in the JSON (no linked market and no PR source).

### CA-34

- **`N0sqEU0nCn`** `2026-us-house-ca34-winner` (Jack1). Mapped. "Rresolves yes to the winner in November." **Confirmed.**
  - Answers: `OnII50cIZc` "Jimmy Gomez (D) (Incumbent)" 0.213 and `lCUnONs9cQ` "Angela Gonzales-Torres (D)" 0.787.
  - Liquidity 2000 (k=1000), 7 bettors. Closes 12-31.
- `UcNPdLcu29` (TW5z0p): empty description, untagged, Gomez 0.362. Conditional.

### CA-37

- **`PLdO9EPtLN`** `2026-californias-37th-congressional` (Jack1, created 10-02). **Conditional**, because the round is implicit.
  - "2026 californias 37th congressional district winner?" The description is only a Wikipedia link.
  - Answers: `sS9gU8Sdpz` "Sydney Kamlager-Dove (D) (Incumbent)" 0.895 and `Uldssu0AuP` "Samantha Mota (D)" 0.105.
  - Liquidity 200, 2 bettors. Sole source.

### CA-40

- **`U9PL8hI5sU`** `who-will-win-the-us-house-race-in-c` (TheDucksFan). **Conditional.**
  - Empty description, no year in the title. Answers: `IqlglZsEA2` "Ken Calvert" 0.618 and `8lSPE9LRSc` "Young Kim" 0.382, untagged.
  - Year and round checked independently:
    - created 2026-06-16, after the primary;
    - closes 2026-11-03;
    - lists exactly the two certified finalists;
    - addAnswers=DISABLED;
    - the creator built the CA portfolio without CA-40 two minutes earlier.
  - The R v R matchup is confirmed by the certified list.
- `sqUzOZN8Cs#5dP6clst9P` "California 40" is **resolved NO**, correctly; this is the current PR source. The resolving comment was from non-creator Jack1 (`qjxvy8q579`), but the resolution itself is on record.
- `E2g8AqQ5gd` resolved Republicans. A settled party market; corroboration only.
- `Cz0OEd9qOE` is State Senate SD-40. Rejected.

## 4. What the PR displays today, and why

| District          | PR today                                                           | Effect                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CA-4              | `yZRqg50ddy` via `HOUSE_RACE_MARKETS` (fills an unpriced district) | Two (D) tags sum to **"Safe D · D 100%"**. PartyPanel shows candidate bars and bets. Counts +1 D.                                                                                                                  |
| CA-7              | `OuAAPuqpzE`                                                       | Same: "D 100%" headline, candidate bets below                                                                                                                                                                      |
| CA-34             | `N0sqEU0nCn`                                                       | Same                                                                                                                                                                                                               |
| CA-11, 12, 14, 37 | **Unpriced** (no mapping)                                          | Hatched. "No Manifold market is linked…" Excluded from totals.                                                                                                                                                     |
| CA-29             | **Unpriced** (no market)                                           | Same                                                                                                                                                                                                               |
| CA-40             | Original portfolio `5dP6clst9P` (resolved NO)                      | **Misclassified**: "Not Democratic · Not D 100%", disabled Dem/any-other buttons, counted in `leaders.notDem` ("races favor a non-Democratic winner"). **Never counted R**, and the candidate market is not shown. |
| CA-6              | CA portfolio `lhIQAZQdqS` 0.896                                    | "Likely D". NO = "any other winner" (Kiley). Correct.                                                                                                                                                              |

So of nine same-party seats, 3 count as D, 5 are missing, and 1 counts as "Not D".

Why it matters:

1. `electionOdds()` sums label tags. That turns two D candidates into a 100% D quote, which is an answer-set constraint, not a traded price. ELECTION-ATLAS.md says exactly this, yet the test "same-party general-election candidate markets retain candidate bets and sum party odds" asserts `{dem:1}`.
2. Untagged labels (CA-11 BenM, CA-14, CA-40) would classify as `other`. Mapped as-is, CA-40 would show **"Other leads 100%"** and CA-14 "Other". That is exactly the "missing party text becomes independent" failure.
3. A cancelled candidate market drops the seat to unpriced, even though the party outcome is fixed by the ballot.

### Override needed (without breaking a valid portfolio)

1. Add a ballot-composition table sourced from the certified list. Party basis must come from this table, never from label text:
   `SAME_PARTY_BALLOT = {'CA-4':'D','CA-7':'D','CA-11':'D','CA-12':'D','CA-14':'D','CA-29':'D','CA-34':'D','CA-37':'D','CA-40':'R'}`
2. `buildRaces`: for these districts, set `race.ballotParty` and count the seat once for that party with `basis:'ballot'`. Keep `race.contract` for candidate display.
   - The headline should read e.g. "D v D · same-party ballot", not "D 100%".
   - The race bar can be solid D/R but must be labelled as ballot-determined.
3. Add `preferOverPortfolio: true` to every same-party entry. No portfolio covers CA-4/7/11/12/14/34/37 today, but `USqLR8OSCI` is **addAnswers=ANYONE**. A user-added "California's 4th Congressional District" answer would otherwise take precedence and hide the candidate market.
4. For CA-40, `preferOverPortfolio: true` is required, because the original portfolio already prices it. This does not break the portfolio: its answer is correct (NO) and remains the fallback. Because party comes from the ballot table, CA-40 counts as R either way, and the fallback is only about which candidate odds are shown.
5. New `HOUSE_RACE_MARKETS` entries:
   - CA-11 `who-will-win-the-2026-election-for-AndtddsLn0`
   - CA-14 `who-will-win-the-2026-election-for-chQddtRLUt`
   - CA-37 `2026-californias-37th-congressional`
   - CA-40 `who-will-win-the-us-house-race-in-c`
   - CA-12: `will-jamie-joyce-win-the-2026-12th` with a **candidate-binary** kind (never the binary=R path), or `2026-california-12th-congressional` until that exists
6. If a candidate market is missing or cancelled: the seat still counts by ballot, and the panel shows "no candidate market". CA-40 additionally can show the resolved portfolio answer.
7. Set `matchup` from the certified names (e.g. "Scott Wiener (D) v. Connie Chan (D)"). Today `matchesRaceQuery` only searches `label/shortLabel/matchup`, so candidate names in individual markets are not searchable.
8. Show all tradable answers, at least finalists plus Other. `PartyPanel maxAnswers=5` hides 4 of CA-11 BenM's 9 answers.

## 5. Candidate→party audit (exact answer IDs; answer text unchanged)

"unknown" means never a ballot candidate, with no party asserted. It is **not** "independent".

| District | Answer ID                                              | Label                                                       | Audited party                                 | Evidence                 |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------- | ------------------------ |
| AK-0     | `AP0zQpUcug`                                           | Nick Begich III (R)                                         | R                                             | Alaska Public; inventory |
| AK-0     | `ytQ5UsCccN`                                           | Matt Schultz (D)                                            | n/a (withdrawn; not on ballot)                | Alaska Public 9/1        |
| AK-0     | `AzEt0Qtnu9`                                           | Bill Hill (I)                                               | I (nonpartisan designation unverified)        | Alaska Public            |
| AK-0     | `cAALtNgyhc`                                           | Other                                                       | other/unknown (holds Hafner D, McDermott L)   | answer set vs ballot     |
| CA-4     | `SNIyON6Etq` / `IEd5ECNILI`                            | Mike Thompson (D) / Eric Jones (D)                          | D / D                                         | CA cert list             |
| CA-7     | `AEZqP5zhth` / `shNId9sNL9`                            | Doris Matsui (D) (Incumbent) / Mai Vang (D)                 | D / D                                         | CA cert list             |
| CA-11    | `P6yR5yzy0A` / `8090CpzU09`                            | Scott Wiener / Connie Chan (untagged)                       | D / D                                         | CA cert list             |
| CA-11    | `UqRhpQQPLl`                                           | Saikat Chakrabarti                                          | D (primary only; not on Nov ballot)           | primary list             |
| CA-11    | `yqULs0yAE5`                                           | Jingchao Xiong                                              | R (primary only)                              | primary list             |
| CA-11    | `tU0QqQ5qsz`, `t6S2gZcAqp`, `QpyLpSn8h9`, `QNuN5glcUR` | Nancy Pelosi, Darren Helton, Christine Pelosi, London Breed | n/a / unknown (none on the 2026 primary list) | primary list             |
| CA-11    | `P0PqNy0tEL`                                           | Other                                                       | other (effectively dead: §8606)               |                          |
| CA-12    | `9lICQQPSZL` / `Onh5QO9udq`                            | Lateefah Simon (D) (incumbent) / Jamie Joyce(D)             | D / D                                         | CA cert list             |
| CA-14    | `L25ctuRCul` / `h0csOsty2h`                            | Aisha Wahab / Melissa Hernandez (untagged)                  | D / D                                         | CA cert list             |
| CA-14    | `QCp0CESZpP`                                           | Matt Ortega                                                 | D (primary only)                              | primary list             |
| CA-14    | `h5lCZSsnlS`                                           | Abrar Qadir                                                 | unknown (not on primary list)                 | primary list             |
| CA-14    | `ddR2nzZlEU`                                           | Other                                                       | other                                         |                          |
| CA-34    | `OnII50cIZc` / `lCUnONs9cQ`                            | Jimmy Gomez (D) (Incumbent) / Angela Gonzales-Torres (D)    | D / D                                         | CA cert list             |
| CA-37    | `sS9gU8Sdpz` / `Uldssu0AuP`                            | Sydney Kamlager-Dove (D) (Incumbent) / Samantha Mota (D)    | D / D                                         | CA cert list             |
| CA-40    | `IqlglZsEA2` / `8lSPE9LRSc`                            | Ken Calvert / Young Kim (untagged)                          | R / R                                         | CA cert list             |

## 6. How each seat enters party totals (exactly once)

- **Basis label:** "same-party ballot: both finalists D (or R for CA-40) per the CA SOS certified list (8/27/2026), so the seat is D (R) by ballot composition; candidate odds come from market X". This adds a seat, not a price. No D-vs-R betting choice is offered, and no Dem-win or Rep-win YES/NO is synthesised for these districts.
- **Other answers:** CA bars write-ins in the general (§8606) and only the top two appear (§8141.5). "Other" can therefore only win through a resolution quirk. Count it as other/unknown in candidate display. It does not change the seat's party.
- **Death or withdrawal after ballot printing:**
  - §8803(b): the ballot vacancy is not filled. A deceased candidate stays on the ballot; if they win a majority, the office is vacant at the start of the term and is filled like any vacancy (for the House, a special election).
  - §8810: a name is removed only for death known ≥68 days before the election. There is no withdrawal path after nomination.
  - Seat outcome: a living D (or R) or a vacancy. Never the other party, though a later special election could in theory differ. Each market's own handling is unspecified except PsPO6z5zZt (withdrawal → NO).
- **Caucus or party switch after the election:** unspecified everywhere. The ballot-composition basis is party preference at election.
- **CA-29:** count D by ballot composition. There are no candidate odds; mark it "no market".
- **CA-6 (Kiley):** see §8.

## 7. Acceptance checklist (all nine districts)

Common checks (apply to each row):

- (a) The district polygon and hex both exist. I verified that `election-atlas.json` has a geo and a hex entry for CA-4, 6, 7, 11, 12, 14, 29, 34, 37, 40 and AK-0 (CA has 52/52).
- (b) Searching "CA-n" or "CAn" selects it. The `matchesRaceQuery` regex handles that today. Candidate-name search needs `matchup` populated.
- (c) The headline shows "same-party ballot", not "D 100%".
- (d) Party totals: exactly one seat in the ballot party, labelled ballot-determined, and not in notDem, other or unpriced.
- (e) Candidate bets are present with complementary YES/NO per answer: P(YES)+P(NO)=1 per answer, and answer YES prices sum to about 1 for sum-to-one markets. NO is labelled "any other winner".
- (f) No label-based reinterpretation: untagged names are not "other/independent", and (D) tags are not summed into a price.
- (g) Missing or cancelled source: the seat still counts by ballot and the panel says no candidate market.

| District | Source to show (round)                            | Priority                                       | Specific checks                                                                                                               |
| -------- | ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CA-4     | `yZRqg50ddy` (Nov general, inferred)              | preferOverPortfolio                            | Both answers visible. Thompson + Jones ≈ 1. Description round clarified by creator.                                           |
| CA-7     | `OuAAPuqpzE` (Nov, explicit)                      | preferOverPortfolio                            | Matsui / Vang bets.                                                                                                           |
| CA-11    | `8uzA88lE2A` (2026 election)                      | preferOverPortfolio                            | Wiener and Chan visible despite maxAnswers. All 9 IDs retained. Not barak's market. Wiener binary never on the binary=R path. |
| CA-12    | `PsPO6z5zZt` as candidate-binary, or `UyqlzUzdAQ` | preferOverPortfolio                            | "Jamie Joyce(D)" renders unchanged. Binary labelled Joyce / any other winner, not R.                                          |
| CA-14    | `zU5S55uNOA` (regular, not special)               | preferOverPortfolio                            | All 5 answers (incl. Ortega, Qadir, Other) present. Untagged labels don't become Other leads.                                 |
| CA-29    | none                                              | —                                              | Visible and selectable. Counted D by ballot. "No candidate market" text.                                                      |
| CA-34    | `N0sqEU0nCn` (Nov, explicit)                      | preferOverPortfolio                            | Gomez / Gonzales-Torres bets.                                                                                                 |
| CA-37    | `PLdO9EPtLN` (inferred)                           | preferOverPortfolio                            | Both answers present.                                                                                                         |
| CA-40    | `U9PL8hI5sU` (inferred)                           | **must** preferOverPortfolio over `5dP6clst9P` | Counted R (not notDem, not other). If cancelled, fall back to the resolved portfolio NO while still counting R.               |

Tests to add or change:

1. Replace the "sum party odds" same-party test with a ballot-basis test.
2. Add a test that an untagged R v R market (CA-40) yields R by ballot, not `other`.
3. Add a test that a CA portfolio answer added later for CA-4 does not hide the candidate market.
4. Add a test that a cancelled candidate market keeps the seat counted.

## 8. CA-6, Kevin Kiley

- **Ballot:** Richard Pan (Democratic) v Kevin Kiley (**No Party Preference**), per the certified list. Kiley was already NPP on the March primary list. Inventory's "Independent" is a simplification; the ballot reads "No Party Preference".
- **Markets:**
  - CA portfolio `USqLR8OSCI#lhIQAZQdqS` "California's 6th Congressional District" (Dem-win 0.896, liquidity 25). This is the PR source.
  - Jack1 candidate binary `0ld2tRulOS` ("Will Kevin Kiley win the Us House race in California 6th in 2026?", p=0.128, liquidity 162, 11 bettors, last bet May 22). Its description says: "Kevin Kiley is a current congressman who left the Republican Party and is running as an independent."
  - `QOICLI9Ezt` is State Senate. Rejected.
- **Party handling:** the PR reads the portfolio as YES = D and NO = "any other winner". Kiley's share therefore lands in "Not D", which is correct and never R.
  - **Do not add `0ld2tRulOS` to `HOUSE_RACE_MARKETS`.** `electionOdds` reads binaries as YES = Republican and would count NPP Kiley as R.
  - Kiley's post-election caucus is unspecified and irrelevant to the Dem-win proposition.
  - The prices agree: Kiley 12.8% v Not-D 10.4%.
