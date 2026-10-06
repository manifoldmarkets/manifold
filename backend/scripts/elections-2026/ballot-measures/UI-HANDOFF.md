# Fourth tab: "Ballot measures" — implementation handoff

Audit date 2026-10-03; the DB snapshot is in `audit/measure-inventory.json` → `auditTimestamp`. These are proposals only: nothing in the live integration checkout was edited.

Integration note: this document preserves the original handoff. The tab is now implemented with 20 linked measures; MA Q9 is withheld. See `audit/INTEGRATION.md` for the actual mapping decisions, closing times and validation.

## What is ready

| File                                                                | Use                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/public/data/ballot-measures-2026.json`                         | 145 measures on the Nov 3 ballot: designation, official title, neutral summary, topic, official source and approval rule. 21 carry an audited `source`: a binary with its YES orientation, or a portfolio contract plus answer ID. The others have no `source` yet, because they are planned (`coverage: needs-creation`) or held. |
| `web/components/usa-map/ballot-measures-model.ts` (+ test, 6 cases) | Pure helpers: `approvalChance`, `tradeFor`, `sideProbability`, `stateMeasureStatus`, `matchesMeasureQuery`.                                                                                                                                                                                                                        |
| `audit/recommended-mappings.json`                                   | Full evidence per measure, if the panel needs more than the data file.                                                                                                                                                                                                                                                             |

## Tab behaviour

1. **Selector.** Add a fourth chamber tab after Governor, labelled "Ballot measures" (compact: "Measures").
2. **Map.** Reuse the state map and state tiles. Do not use the district cartogram.
   - Fill states by `stateMeasureStatus(...).total` with a sequential non-party palette.
   - **No statewide measures** gets its own neutral style and copy ("No statewide measures on the Nov 3 ballot"). It is not "unpriced".
   - States with measures but no linked market still show their count, plus "No linked market" for those measures.
   - No D/R colours, balance bar, seats or incumbents.
3. **Details panel.** Selecting a state opens the existing draggable panel, listing that state's measures. Each row shows:
   - designation and short title, neutral summary, topic chip, and the approval rule in short form (e.g. "Needs 60%", "Needs majority of all ballots");
   - **chance of ballot approval** from `approvalChance(measure, contract)`. Show nothing priced when the result is undefined (missing, cancelled or mismatched source);
   - **Pass / Fail** buttons. Each calls `tradeFor(measure, side)` and opens the existing bet dialog with exactly that contract, outcome and (for portfolios) answer ID. Button probabilities come from `sideProbability`, so the two sides always sum to 1;
   - a small chart link (the contract URL) and the official-source link;
   - a conditional badge where `source.confidence === 'conditional'`, with its caveat from the mappings file;
   - for measures without a source: "Market planned (pending review)" or "Held: <reason>". Never show a guessed price.
4. **Search.** `matchesMeasureQuery` handles state names and codes, designation forms ("prop 50", "CA Prop 50", "Q6", "SQ 845", "amendment 3") and topic or subject words. A number alone matches only that number within a state, never another state's number. An optional featured strip can group measures by topic.
5. **Portfolios.** These are independent multi-answer markets. Use independent-answer trading (the answer bet panel's YES/NO on one answer). Never show sum-to-one candidate controls, and never normalise portfolio answers.

## Semantics that block or limit safe mapping

- **No reverse-worded source is mapped.** Every mapped binary is YES = approve. `tradeFor` already supports `yesOrientation: 'reject'` if one is added later.
- **Off-ballot rules differ.**
  - zax's California portfolio resolves an off-ballot answer NO; Jack1's voter-ID binary (Prop 39) resolves N/A.
  - Gabrielle's Massachusetts portfolio has an empty description, so its rule is unspecified and all eight of its answers are conditional.
  - The Massachusetts Question 3 binary resolves N/A.
- **California Prop 40** (billionaire tax). If Props 41 or 42 get more yes votes, they can void it. The mapped market resolves on passing, not taking effect: a Prop 40 majority is YES even if it is later voided. Label it "approval", not "in effect".
- **Thin sources.**
  - The Massachusetts portfolio answers have 111 liquidity each; a Ṁ100 buy moves one from 44% to 76%. A 2,000 subsidy is recommended.
  - Arizona Prop 318 and Alabama Amendment 3 have about 100 liquidity each.
  - Show the trade's price impact; the mappings file holds the simulated buys.
- **California Prop 43** is held. BenM's market describes the withdrawn Howard Jarvis initiative (#1983); the official Prop 43 is ACA 22.
- **Idaho's state-gun question** is held. It is an advisory multiple-choice question, not a pass/fail measure.
- **Held for creation** (20, listed with reasons in the inventory):
  - Arizona (7) and Alaska (2): official sites blocked from our network;
  - Michigan Proposal 1, the constitutional convention question: identity is certain, but michigan.gov blocks us and no official source is cited yet;
  - Rhode Island bonds (5): question order and amounts conflict between sources;
  - Nebraska, New Hampshire and Kansas: ballot numbers not published;
  - Colorado Amendment 81 and Florida Amendment 3: each waits on an existing market's creator clarifying the rule.
- **Tennessee amendments** pass only if YES votes exceed half of all votes cast for governor. The new markets say so; any future "pass" market must too.
- **Dates.** Every measure here is Nov 3, 2026. Measures decided earlier in 2026 are excluded and should not appear: Alaska Measure 1 (Aug 18), Alabama's May primary amendments, and Virginia's April 21 redistricting amendment, which the Virginia Supreme Court later voided.
