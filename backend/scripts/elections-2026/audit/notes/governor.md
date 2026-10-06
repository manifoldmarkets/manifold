# Governor audit — narrative notes (36 races)

Snapshot: prod DB 2026-10-03 00:50–00:58 UTC (dossier/markets.json). Web checks 2026-10-03. Read-only throughout.
Structured output: `out/agent_governor.json` (one object per race key, in `races.json` order).

## Summary

| Decision                      | Count | States                                                           |
| ----------------------------- | ----- | ---------------------------------------------------------------- |
| keep-current (confirmed)      | 8     | AZ, CA, FL, GA, MA, MI, NY, TX                                   |
| keep-current (conditional)    | 8     | AK, AR, NE, NV, NH, NM, OH, OR                                   |
| switch (confirmed)            | 3     | CO → `8ustL98CUg`, IA → `8NuShEdyCh`, KS → `n2A2ySggys`          |
| add-new-mapping (conditional) | 15    | AL, CT, HI, ID, IL, ME, MD, OK, PA, SC, SD, TN, VT, WI, WY       |
| needs-review                  | 1     | MN (no market works with the PR code as written)                 |
| needs-creation                | 1     | RI (independent Ken Block polls second; no market can price him) |

All 19 PR-linked states keep a usable source (3 switch). Of the 17 unlinked states, 15 can be priced now with an existing market, MN can be priced after a one-line code change, and RI needs a new market.

## How the PR counts a governor source (checked in code)

`buildRaces('governor', …)` calls `electionOdds(contracts[state])` with `twoPartyControl = false` (`web/components/usa-map/election-map-model.ts`):

- **Binary (cpmm-1):** `rep = P(YES)` and `notRep = 1 − P(YES)`. NO is shown as gray "Not R" and never credited to D. This is correct for "will a Republican win" markets. **Any YES = Democrat binary gets inverted.** That rules out, as mapped today: AL `gA2ALuO5AS`, MN `LNPL28tA80`, WI `g0zN5ghS90` (10,118 liquidity, the deepest WI market), TN `d552z0Iu6c`, NH `pZpEqPAq5U`, TX `A9hC8NPQnn`, and every D-candidate binary.
- **Sum-to-one multi:** each answer is classified by its label. `isDemocraticAnswer` matches `/democrat/i`, an exact `(D)` tag, or the `ALSO_DEMOCRATIC` list. `isRepublicanAnswer` matches `/republican/i` or `(R)`. Everything else counts as other.
  - **`(DFL)` is not recognised**, so Minnesota's "Amy Klobuchar (DFL)" would count as _other_.
  - Untagged candidate names (CT `dolAIoXwhrmaC5Eh8X0z`, MI `IQNls8yq20`, IA `sgzhuQAzP8`, ME `h6hhqZpCAN`, MA `22uLEUthCC`, TX `ENSE50n2Lg`) would all count as other, so those markets can't be used as party sources.
- **Wrong code comment:** the docstring on `isCandidateLabelledAnswer` (`state-election-map.tsx`) says these markets "resolve on PARTY regardless of who the nominee turns out to be". That is false for KS/OH/OR, which resolve on the named person. The user-facing party-panel note only shows when the question contains "which party", so those three never display a false note. The comment itself should still be corrected.
- **Candidate cards** (`governorCandidates2026`) are display-only and never enter totals. A card is hidden when the main source already has `(D)`/`(R)`-tagged answers.

## (a) Verifying the recent additions

### Michigan — `who-will-the-2026-michigan-governor` (LE6s82ZcAp, Jack1) → keep, confirmed

- **Duggan is not on the November ballot.** Mike Duggan ended his independent campaign on **2026-05-21 at 11:04 EDT** ([WILX](https://www.wilx.com/2026/05/21/mike-duggan-drops-out-michigans-gubernatorial-race/), [Michigan Advance](https://michiganadvance.com/2026/05/21/duggan-drops-independent-bid-for-governor-remapping-2026-michigan-gubernatorial-landscape/)). He cited a polling deficit and lack of funding. He withdrew before Michigan's independent qualifying stage, and the certified list in the inventory has Benson (D), James (R), Brandenburg (U.S. Taxpayers), Campbell (Green) and Hudson (Libertarian), with no Duggan.
- **Timing:** the market was created at 2026-05-21 05:03 UTC (01:03 EDT), about **10 hours before** he withdrew. So the Duggan answer was legitimate at creation and is now a dead answer.
- **What the market resolves on:** the description says only "Resolves yes to the winner". The answers are **"Democratic Party Nominee"**, **"Republican Party Nominee"**, "Mike Duggan - Independent" and **Other** (addAnswers ONLY_CREATOR). The nominee answers are real party-nominee propositions, not static candidate labels, so a replacement nominee stays in the same answer.
- **Effect on validity:** the market remains valid. Every real ballot candidate is covered by a nominee answer or by Other. The Duggan answer can only resolve NO (barring a write-in, and none is known). It still holds 0.3% (2,200 volume), which is stale residue.
- **PR aggregation:** D = 0.940, R = 0.051, other = Duggan 0.003 + Other 0.006. Valid; the Duggan residue only inflates "other" by 0.3 pp.
- **Fixes:** the PR comment ("Michigan includes party nominees, Duggan and Other") is out of date. Suggest the creator resolve the Duggan answer NO early.
- **Other Michigan markets:**
  - TheDucksFan `lEt6RCNP5l`: the creator's ruling that a Duggan win would resolve N/A (comment `aboaqc187zg`: "It would resolve N/A") is now moot.
  - MikeLinksvayer `IQNls8yq20`: 12 of its 15 named answers are primary losers or non-runners, including Duggan.

### Florida — `will-a-republican-win-the-florida-g` (uODgxBgIoHZWqFqHGPbe, Gabrielle) → keep, confirmed

- Description: "Will the election be won by a Republican?" **YES** = the winner is a Republican (nominee Byron Donalds). **NO** = any other winner: David Jolly (D), Scott Jewett (L), or any of the five independents on the inventory list (Abrams, Burkett, Datto, Dimanche, Russo).
- **PR aggregation:** rep = 0.791, notRep = 0.209, dem = 0. Valid. This is exactly the "candidate-win NO is any other winner" semantics, and the D share is correctly not inferred.
- **Unspecified:** call vs certification, timing of party affiliation, cancellation.
- **Closes 2026-11-03 04:59 UTC** (11:59 pm EST on Nov 2), so there is no Election-Day trading.
- YES limit depth is 200 nominal but only 100 funded.
- Jason Pizzo (NPA) announced a run in 2025 but is not on the inventory's certified list. I did not verify this independently. It doesn't affect this binary either way.

### Kansas / Ohio / Oregon — Jack1 named-candidate multis (created 2026-09-06)

|                            | Kansas `NI8z9LLtR5`                                                                | Ohio `tyqgQCS0zd`                                            | Oregon `InE0tLCOC0`                                                 |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Description                | Wikipedia link only                                                                | Wikipedia link only                                          | Wikipedia link only                                                 |
| Resolves on                | The named winner; the title asks "…election winner?"                               | same                                                         | same                                                                |
| Answers                    | "Ty Masterson (R)" 0.72, "Cindy Holscher (D)" 0.28                                 | "Vivek Ramaswamy (R)" 0.372, "Amy Acton (D)" 0.628           | "Tina Kotek (D) (Incumbent)" 0.73, "Christine Drazan (R)" 0.27      |
| Other answer?              | **No**; addAnswers DISABLED                                                        | **No**; DISABLED                                             | **No**; DISABLED                                                    |
| Minor candidates on ballot | none listed in inventory                                                           | Kissick (L)                                                  | Brett Smith (Pacific Green); Green Papers lists 4 more (unverified) |
| Unspecified                | replacement, withdrawal, cancellation, call vs certification, third-party win      | same                                                         | same, plus cross-nomination                                         |
| Creator comments           | `awx1i7ck39g`: "olease add to midterm governor dashboard…" (a request, not a rule) | `ctxwflgi4qf`: "plewse attach to midterm dashboard for ohio" | `fr592rljjt`: "please add to midterm dashboard for oregon thanks"   |
| Liquidity                  | 1000 (500/answer), 4 bettors                                                       | 1000 (500/answer), 9 bettors                                 | 1000 (500/answer), 6 bettors                                        |

**How the PR counts them:** the `(R)`/`(D)` regex turns each named person into a party share, so P(Masterson) is counted as R and so on.

**Is that valid?** Only as a **candidate proxy**, never as a party contract. It holds while each named person is their party's nominee and the only viable candidate. It breaks in two cases:

- **Replacement nominee:** if a nominee withdraws or dies, the replacement has no answer. The party's chance would not transfer and the market would likely go to N/A or the creator's discretion.
- **Third-party or write-in winner:** there is no answer for them (likely N/A).

These are low-probability, but the market does not say what happens in either case.

**Decisions:**

- **KS → switch to `n2A2ySggys`.** It is a direct party binary by the same creator: "Resolves to the winner of the 2026 Kansas Governor election. Resolves based on media reporting and official results." Its YES = R matches the PR's binary reading, and it has the same 0.72 price. It only has 184 liquidity, so I recommend a **1000 mana subsidy**. The alternative TheDucksFan multi `gOgCIPuPOs` would render D in blue but has an empty description.
- **OH → keep (conditional).** There is no described party contract. The only party multi (`qqyq8In6IU`, title-only, 200 liquidity) is priced D 0.54, out of line with this market (0.63) and with the 192-bettor Ramaswamy binary `a86n8pc6e3` (0.37 → Acton ≈ 0.63).
- **OR → keep (conditional).** The only party alternative (`cORLnAtu90`) has not traded since 2026-07-24 and sits at D 0.867, against Kotek 0.73 here.
- **For both OH and OR:** ask Jack1 to add an Other answer and a replacement rule.

## (b) Candidate cards and non-plurality final rounds

**CA card `who-will-be-elected-governor-of-cal` (AEAqQL09gN, Xiphias):**

- The description is empty, so the proposition comes from the title alone: "Who will be elected governor of California in 2026?" That is the right round: the Nov 3 top-two general between Becerra (D) and Hilton (R). CA does not count general-election write-ins for voter-nominated offices (Elections Code §8606).
- No rules on calls or certification. Closes 2026-11-30. addAnswers ANYONE.
- 7 of its 9 named answers are not on the ballot (Swalwell, Porter, Cloobeck, Steyer, Mahan, Harris, "Li'l Petey").
- It is acceptable as a display card, but **`who-will-win-the-2026-california-gu` (KmbNYfuOrUnI1w1GSHdb, Conflux) is better**:
  - creator rule: "Resolves when the race is projected by a major news outlet or Dave Wasserman", and it re-resolves if official results differ;
  - 59 bettors and 655 liquidity;
  - limit depth of 50,000 on Becerra YES at 0.95–0.96 and 25,000 on Hilton NO at 0.04.

**NY card `who-will-be-elected-governor-of-new` (ON06RhC0dn, Xiphias):**

- Empty description. The proposition (2026 election winner, Nov 3 plurality) is right, but **the answer set is wrong for the ballot**:
  - **Antonio Delgado** ended his primary challenge on 2026-02-10 ([City & State](https://www.cityandstateny.com/politics/2026/02/antonio-delgado-ends-his-campaign-governor/411320/)).
  - **Elise Stefanik** suspended her campaign in Dec 2025 ([NBC NY](https://nbcnewyork.com/news/local/president-trump-backs-blakeman-for-new-york-governor-after-stefanik-drops-out/6433749)).
  - The Republican nominee, **Bruce Blakeman, is not an answer**. He is priced only inside "Other" (0.020), and answers are creator-only, so nobody else can add him.
- **Recommend dropping the NY card or asking Xiphias to add Blakeman.** No current candidate multi names Blakeman. The Blakeman binary `29szlS5guQ` exists but has an empty description.
- NY uses fusion voting. The party source (`5ElGq01XrCeDtPRsFjUM`) does not say how fusion lines are handled; the natural reading is the candidate's party.

**Races whose final round is not a Nov 3 plurality:**

- **Georgia:** a majority (50%+1) is required; otherwise a top-two **runoff on Dec 1, 2026**. The Libertarian Party failed to collect signatures for statewide access ([AJC](https://www.ajc.com/politics/2026/07/libertarians-wont-be-on-the-ballot-in-georgia-meaning-likely-no-runoffs/)), so only Jackson (R) and Bottoms (D) are printed and a runoff now needs write-ins to deny a majority.
  - The source `JCkqQkGivcOi59ArT0BY` resolves to the party "which won … as determined by" officials, which implies the runoff winner. It does not mention runoffs explicitly.
  - It closes 2026-11-04 07:59 UTC, so in a runoff the map would show a frozen pre-runoff price.
- **Alaska:** top-4 primary, then a **ranked-choice general**. The final RCV round decides if nobody has a first-round majority.
  - Final ballot: Kreiss-Tomkins (D), Wilson (R), Bronson (R), Taylor (R).
  - Begich (D, 2nd in the primary) withdrew and endorsed Kreiss-Tomkins, which moved fifth-place Taylor up. Taylor was disqualified on Aug 31 and **reinstated Sep 4** ([ADN](https://www.adn.com/politics/2026/09/04/treg-taylor-is-back-in-alaskas-race-for-governor-after-election-officials-reverse-decision/), [Wikipedia](https://en.wikipedia.org/wiki/2026_Alaska_gubernatorial_election)).
  - The party source `UEnlNUy92z` does not mention RCV. That is harmless for a party outcome because one winner emerges either way, but it closes 2026-11-04 23:59, before any RCV tabulation.
  - Jack1's candidate multi `ZgyhS5cdI9` is **rejected**: it lacks Treg Taylor (R), so his chance falls into "Other". It also still lists Begich (withdrew), Click Bishop (dropped out) and Bill Walker (not on the ballot).
- **Maine:** the governor general is **plurality, not RCV**. Maine's RCV applies to primaries and federal general elections only ([Wikipedia](https://en.wikipedia.org/wiki/2026_Maine_gubernatorial_election)). NYT/Siena (Jun 19–26) had Pingree 50, Charles 36, Bennett 8.
- **Vermont (not asked, but it qualifies):** a **majority is required**. If no one gets one, the General Assembly elects from the top three by joint ballot (Vt. Const. ch. II §47), in January 2027. There are five candidates on the ballot. Neither VT market (`ungp6gZIzh`, `Uc2n2NnE6I`) says whether "win" then means the plurality leader or the legislature's pick.
- **California:** top-two general; see the card section above.

## (c) Unlinked states (17)

Most have only a TheDucksFan "Which Party will win…" multi: **empty description, 50 mana per answer, addAnswers DISABLED, and usually no Other answer**. They are valid ballot-party propositions on the title alone, so I map them as **conditional**. Where a deeper YES = D binary exists, I list it as a conditional alternative that needs a per-source YES=D flag.

| State | Decision           | Source                  | Price at snapshot                        | Liquidity / bettors / last bet | Notes                                                                                           |
| ----- | ------------------ | ----------------------- | ---------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| AL    | add                | `Qlg62L5zAE`            | R .91 / D .09                            | 200 / 10 / 9-26                | D binary `gA2ALuO5AS` would invert; subsidy 500                                                 |
| CT    | add                | `8dOsCEc9ZL`            | D .93 / R .07                            | 200 / 5 / 6-27                 | Ibozz91 multi untagged and missing Fazio; CT fusion unspecified; subsidy 500                    |
| HI    | add                | `6IgNyCCSUn`            | D .94 / R .06                            | 200 / 10 / 6-27                |                                                                                                 |
| ID    | add                | `lhIcPAERzU`            | R .94 / D .03 / Other .03                | 100 / 5 / 6-23                 | has Other (covers Stegner, I)                                                                   |
| IL    | add                | `Pyl66EshPl`            | D .967 / R .033                          | 200 / 5 / 9-16                 | D answer never traded                                                                           |
| ME    | add                | `lypQhntEzA`            | D .989 / R .008 / Other .003             | 100 / 11 / 10-2                | Other covers Bennett (I); subsidy 500                                                           |
| MD    | add                | `yqOnLgpc6C`            | D .983 / R .017                          | 200 / 8 / 9-8                  |                                                                                                 |
| MN    | **needs-review**   | `LNPL28tA80` (D binary) | YES(D) .95                               | 100 / 11 / 9-29                | inverted unless YES=D flag; alt `NC699pLyPA` needs `(DFL)` recognised                           |
| OK    | add                | `ECpCNAhRlE`            | R .93 / D .07                            | 200 / 8 / 6-22                 | 3 independents, no Other                                                                        |
| PA    | add                | `QcPEg95OS6`            | D .99 / R .01                            | 200 / 5 / 7-3                  | Shapiro binary would invert                                                                     |
| RI    | **needs-creation** | —                       | (`6RggZOAN5y` D .966 / R .034, rejected) | —                              | Block (I) polls second                                                                          |
| SC    | add                | `0Ep202R8RS`            | R .924 / D .076                          | 200 / 9 / 7-29                 |                                                                                                 |
| SD    | add                | `88upNEt2tn`            | R .94 / D .06                            | 200 / 11 / 10-1                |                                                                                                 |
| TN    | add                | `SIsCPzP6sZ`            | R .93 / D .07                            | 200 / 5 / 6-29                 | 13 independents, no Other                                                                       |
| VT    | add                | `ungp6gZIzh`            | R .74 / D .26                            | 200 / 10 / 10-2                | majority rule (see b); subsidy 1000                                                             |
| WI    | add                | `qScqn2tS8Q`            | D .845 / R .155                          | 200 / 29 / 10-2                | `g0zN5ghS90` D binary (10,118 liquidity, 82 bettors) preferred if YES=D supported; subsidy 1000 |
| WY    | add                | `dtZA0OZ8yZ`            | R .95 / D .05                            | 200 / 8 / 6-14                 |                                                                                                 |

**Rhode Island — needs-creation (candidate multi):**

- McKee lost the Sep 9 Democratic primary to Foulkes. A post-primary poll had Foulkes 44%, Block 19 points behind (≈25%), and Guckian 17% ([Wikipedia](https://en.wikipedia.org/wiki/2026_Rhode_Island_gubernatorial_election)).
- The only market (`6RggZOAN5y`) has just Republicans/Democrats and no Other, so it cannot price Block.
- **Suggested shape:**
  - Answers: "Helena Foulkes (Democratic)", "Aaron Guckian (Republican)", "Ken Block (Independent)", and Other (covers Gotra, Reynolds, write-ins).
  - Resolves to the plurality winner of the Nov 3 general, on the AP call, re-resolving if the certified result differs.
  - A replacement nominee inherits the party answer; N/A if no election is held.
  - Write party names out in full so the PR classifier maps D/R and leaves Block as other.

**Maine (optional, not required):** a candidate multi naming Rick Bennett would price him explicitly instead of through "Other". Suggested answers: Hannah Pingree (Democratic) / Robert "Bobby" Charles (Republican) / Rick Bennett (Independent) / Other, plurality, with the same rules as RI. The TheDucksFan market already has Other, so this is not needed for the map.

**Minnesota:** there are two valid sources, and **neither works with the PR code unchanged**.

- `LNPL28tA80` is a party binary. Rule: "resolves YES if the Democratic nominee wins … official results from the Minnesota Secretary of State." Using it needs YES=D binary support.
- `NC699pLyPA` is a candidate multi with Other, plurality, MN SoS results and 525 liquidity. Using it needs `(DFL)` to count as D.
- I prefer the party binary (proposition first). Either needs a one-line change, so I marked MN **needs-review** rather than add.

## (d) Resolved, cancelled, or naming eliminated candidates

- **No in-scope governor market is resolved or cancelled** at the snapshot. At answer level, `hsUns58P28` (CA "if makes the runoff") already resolved the Steyer, Mahan and Porter answers CANCEL.
- **Open binaries on eliminated or non-candidates.** None has a creator ruling; some carry non-creator "can resolve no" comments, which are not rulings:
  - CA: Harris `S0Nhz5S5Sg`, Swalwell `AnE5Zt5QlC`, Kounalakis `As15lo4LvjBK6e9X9UJD`, Yee `60mfNct7BetemzImychh`, Atkins `dHNJbguw3iMBwjU0Fa62`, Bonta `fTiz6jKGppfj5dLdO2Z8`
  - FL: Gaetz `cx4ua3MQ1Klmc4JdSiol` (not a candidate)
  - CO: Bennet `ZA99ESP26N` (lost the nomination to Weiser; the creator is waiting for Yglesias's review, comment `8bicrnzb55p`)
  - NY: Torres `NP9CqulZcA`
- **Candidate multis with dead answers:**
  - AK `ZgyhS5cdI9`: Begich, Bishop, Walker; missing Taylor.
  - CA `AEAqQL09gN` (PR card), `KmbNYfuOrUnI1w1GSHdb`, `9h2sl00ex6`.
  - CO `8ustL98CUg`: "Willow Collamer (unaffiliated)" is not on the ballot list.
  - CT `dolAIoXwhrmaC5Eh8X0z`: six non-nominees; missing Fazio.
  - MI `LE6s82ZcAp`: the Duggan answer. MI `IQNls8yq20`: many dead answers.
  - MN `NC699pLyPA`: 18 of 20 named answers are primary losers or non-runners.
  - NY `ON06RhC0dn` (PR card): Delgado, Stefanik.
  - TX `ENSE50n2Lg`: O'Rourke, Allred.
  - WI `pu5gq8nC6c`: Barnes, Hong, Brennan and Rodriguez did not win the primary; non-creator comment `huy56xi0bxc`: "These can n/a except crowley".

## Other findings

1. **Third parties with no answer.**
   - NE `QcRqudlpPl` (R/D only): Brett Lindstrom, a former Republican state senator, refiled on 2026-09-01 as the **America First Party** nominee ([WOWT](https://www.wowt.com/2026/09/01/brett-lindstrom-refiles-nebraska-governor-america-first-party-candidate/)), and an April PPP poll had Rick Beard (Legal Marijuana NOW) in double digits. A third-party win has no answer. Kept as conditional because there is no alternative; subsidy 1000.
   - NV (Danielle Ford, I), CO (current source), IA (current source), OK, TN, IL and AR are in the same position, at lower risk.
2. **NH alternative `pZpEqPAq5U`:** the text says "pursuant to the 2026 election", but it mirrors a Kalshi ticker ending **`-28`**. Check which cycle it mirrors before anyone uses it.
3. **Unfunded limit orders** (balance-capped to 0) on AZ D-YES, CA D-YES, CO (both sides) and NV R-NO. The nominal depth there is illusory.
4. **Snapshot artifact:** `ZgyhS5cdI9` answer rows appear twice in `markets.json`/the dossier (same IDs). This is an extraction join issue, not a market property.
5. **Stale TheDucksFan prices** (no trade since June/July): CT, HI, ID, OK, PA, SC, TN, WY, plus the OR alternative. Their prices are unanchored, and subsidy alone will not fix that without traders.

**Subsidy recommendations (mana):**

| Market          | Amount | Reason                           |
| --------------- | ------ | -------------------------------- |
| AK `UEnlNUy92z` | 1000   | 35 per answer, competitive       |
| KS `n2A2ySggys` | 1000   | replaces a 1000-liquidity source |
| NE `QcRqudlpPl` | 1000   |                                  |
| NV `qdC0cQduhC` | 1000   | toss-up                          |
| VT `ungp6gZIzh` | 1000   |                                  |
| WI `qScqn2tS8Q` | 1000   | unless the D binary is used      |
| AL `Qlg62L5zAE` | 500    |                                  |
| CT `8dOsCEc9ZL` | 500    |                                  |
| ME `lypQhntEzA` | 500    |                                  |
| MN `LNPL28tA80` | 500    |                                  |

## Open questions

- **MN:** add YES=D binary support, or treat `(DFL)` as D? Requester decision; it blocks MN.
- **NY card:** drop it, or ask Xiphias to add Blakeman? **CA card:** repoint to `KmbNYfuOrUnI1w1GSHdb`?
- **GA, AK, VT:** none of these markets states how a runoff, RCV tabulation or legislative election is handled. Each closes before that stage could happen.
- **Ballot lists not fully verified:**
  - Oregon: inventory has 3 candidates; The Green Papers lists 7 (not verified against the Oregon SoS).
  - Kansas: minor or write-in candidates not verified.
  - Florida: whether Pizzo qualified.
- **Michigan:** whether Jack1 will resolve the Duggan answer NO early.
- **OH / OR:** replacement and third-party handling (ask Jack1 to add Other).

## Sources

- Duggan withdrawal: https://www.wilx.com/2026/05/21/mike-duggan-drops-out-michigans-gubernatorial-race/ ; https://michiganadvance.com/2026/05/21/duggan-drops-independent-bid-for-governor-remapping-2026-michigan-gubernatorial-landscape/
- Michigan ballot list (May): https://clickondetroit.com/news/local/2026/05/25/whos-on-the-ballot-for-michigans-governor-in-the-2026-election-heres-a-list
- Alaska ballot: https://www.adn.com/politics/2026/09/04/treg-taylor-is-back-in-alaskas-race-for-governor-after-election-officials-reverse-decision/ ; https://en.wikipedia.org/wiki/2026_Alaska_gubernatorial_election ; https://www.kmxt.org/alaska-statewide-news/2026-08-31/november-ballot-in-alaska-governors-race-set-after-chaotic-last-day-scramble
- Georgia runoff and Libertarians: https://www.ajc.com/politics/2026/07/libertarians-wont-be-on-the-ballot-in-georgia-meaning-likely-no-runoffs/ ; https://www.thegreenpapers.com/G26/GA
- Maine plurality and poll: https://en.wikipedia.org/wiki/2026_Maine_gubernatorial_election ; https://www.bangordailynews.com/2026/07/01/politics/elections/maine-governor-race-poll-hannah-pingree-bobby-charles-rick-bennett/
- Vermont majority rule: https://sos.vermont.gov/elections/election-info-resources/election-law ; https://archive.fairvote.org/irv/vermont/22constitution.htm
- California write-ins: https://ivn.us/posts/state-senate-set-ban-general-election-write-voting-update-i-and-ii
- New York: https://www.cityandstateny.com/politics/2026/02/antonio-delgado-ends-his-campaign-governor/411320/ ; https://nbcnewyork.com/news/local/president-trump-backs-blakeman-for-new-york-governor-after-stefanik-drops-out/6433749
- Rhode Island: https://en.wikipedia.org/wiki/2026_Rhode_Island_gubernatorial_election
- Nebraska: https://www.wowt.com/2026/09/01/brett-lindstrom-refiles-nebraska-governor-america-first-party-candidate/ ; https://en.wikipedia.org/wiki/2026_Nebraska_gubernatorial_election
- Oregon (unverified extras): https://www.thegreenpapers.com/G26/OR
- Kansas: https://en.wikipedia.org/wiki/2026_Kansas_gubernatorial_election
