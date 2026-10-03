# Ballot audit integration — October 3, 2026

The supplied audit report and JSON are preserved as evidence. This file records integration decisions that differ from that handoff.

- Display all 145 statewide November questions in 39 states. Use count shading and separate approval quotes; no party balance or combined probability.
- Link **20 measures: 10 confirmed and 10 conditional**. The three California portfolio answers retain their original identifiers; seven Massachusetts portfolio answers have no description. Explain these limitations on their cards.
- **Withhold MA Question 9**, even though the audit proposed conditional reuse. Its answer asks whether the gun law is upheld. A NO majority below the referendum's 30%-of-all-ballots threshold can leave the law in place, so this is not a reliable quote for a YES majority. Do not relabel it Pass/Fail until the creator clarifies. This adds a third held mapping alongside CA Prop 43 and Idaho's multiple-choice state-gun advisory question.
- CA Prop 40 quotes voter approval, not whether it ultimately takes effect. Missouri Prop A Pass means approval of the 2025 map. Both distinctions appear on the card.
- Map sources load by audited contract ID, use current contract/answer prices and subscribe to live updates. Portfolio answers trade independently by answer ID. Cancelled, mismatched or sum-to-one sources show no price. Closed/resolved sources cannot be traded from the card.
- Search state, number, aliases and topic. Cards sort by natural ballot number. No-measures states remain selectable. Chart links open descriptions/comments; trades use the existing in-page dialogs.

## Creation plan

The ballot manifest retains its own `us-2026-ballot-measures-v1` idempotency series. The user selected **@ManifoldPolitics** and approved a **410,000 combined ceiling**, conditional on the independent audit passing. Allocations are 306,000 for races and 103,000 for ballots, with 1,000 unallocated. **Payload, criteria and seed review remain unapproved.** No creation, subsidy or bet was submitted.

- 103 ready drafts at 1,000 each: **103,000 mana**.
- 13 optional upgrades to 10,000 add 117,000: **220,000 mana** total.
- 19 further creation drafts remain unresolved; they would add at least 19,000 if cleared. Three held mappings have no ready creation payload, including MA Q9 added during integration.
- Combined with the existing race plan: **409,000 baseline**, or **526,000 with all 13 ballot upgrades**, excluding held drafts and proposed subsidies.
- Change the proposed close time from November 3 23:59 UTC (before some US polls close) to **November 4 12:00 UTC**. Existing community market closing times are untouched. Seed probabilities and criteria still require review.
- Seed review: the script submits the manifest probabilities unchanged. House seeds mainly use PVI and incumbency in a neutral national environment, usually with 2% for another party/independent. Of 103 ready ballot entries, 71 currently start at 50% and 91 are flagged for seed review. Poll support is not itself a passage probability; the audit must assess the conversion and each approval threshold before signoff. These per-entry flags are informational; the global review gate controls apply.
- Preserve the handoff's search fix: paginate with `sort=newest` and `beforeTime`, overlapping the boundary millisecond and deduplicating IDs. The API rejects offsets above 1,000. Stalled/incomplete pagination fails closed.

Validation: 41 election/ballot model tests and 39 mocked creation tests pass. Both offline manifests validate without errors: 103 ballot creations / 19 unresolved, and 225 race creations / 4 unresolved. Full web and focused CLI type checks pass. Browser checks include independent-answer and binary complements, disputed sources, no-measures states and responsive controls. No tests establish settlement equivalence beyond the reviewed source evidence.
