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

- 102 ready drafts at 1,000 each: **102,000 mana** (within the 103,000 allocation; Michigan Proposal 1 is held).
- 13 optional upgrades to 10,000 add 117,000: **219,000 mana** total.
- 20 further creation drafts remain unresolved; they would add at least 20,000 if cleared. Three held mappings have no ready creation payload, including MA Q9 added during integration.
- Combined with the existing race plan: **408,000 baseline**, or **525,000 with all 13 ballot upgrades**, excluding held drafts and proposed subsidies.
- Change the proposed close time from November 3 23:59 UTC (before some US polls close) to **November 4 12:00 UTC**. Existing community market closing times are untouched. Seed probabilities and criteria still require review.
- Seed review: the script submits the manifest probabilities unchanged. House seeds mainly use PVI and incumbency in a neutral national environment, usually with 2% for another party/independent. Of 102 ready ballot entries, 70 currently start at 50% and 90 are flagged for seed review. Poll support is not itself a passage probability; the audit must assess the conversion and each approval threshold before signoff. These per-entry flags are informational; the global review gate controls apply.
- Independent review fixes (October 3, after integration):
  - **Idaho HJR 4** was marked advisory because its verification notes mention the separate HB 932 state-gun question, so its description called a binding constitutional amendment non-binding. The flag now comes from the verified measure type only, and the validator rejects any binding measure described as advisory.
  - **Michigan Proposal 1** is held. Its only cited source was the Citizens Research Council, not an official page, and michigan.gov blocks the audit network.
  - **Duplicate re-check.** Searches never requested answers, so every multi-answer market arrived with none. A portfolio answer naming a measure was missed, and existing race markets could only look ambiguous. Searches now send `includeLiteAnswers=true` and re-read possible multi-answer matches in full. A 404 or malformed search result stops the run. Pages shrink to 100 rows, because the server answers a failed query with HTTP 200 and no rows.
  - **Apply safety.**
    - A 2xx reply without a contract ID is reconciled by the reserved ID instead of being recorded as a free failure.
    - A later run reads a failed entry's reserved ID before skipping it.
    - Any 4xx rejection stops the run.
    - Multi-answer markets are checked against `answerProbs` after creation; a mismatch stops the run.
    - `--env` is required, as is an existing `--state` file unless `--init-state` is passed.
    - The state file records the API base and creator and refuses a mismatch.
    - A lock file blocks concurrent runs.
  - Seed review flags in the dry-run report now distinguish an "unsupported default seed" from a "judgement call on the cited evidence".
  - **Race false positives.** With answers visible, the online re-check flagged 22 race entries (33 hits) and 2 measures, all on unrelated multi-answer markets: NASCAR drivers, the next Speaker, another state's Senate race, and the Mayor of London.
    - A candidate in an answer now needs the full name; the question alone may still match on surname.
    - A question that names only another office, or only other states, is unrelated.
    - "government" no longer counts as the governor's office.
    - The rest are reviewed rejections in the manifests: the thin Midwest House portfolio `s2uNNQ2N5I` (OH-02/03/04/08, already rated conditional), `dRIhl5gzpL` (PA-09), `Ih8AhPAILl` (MO-07), `lfx0456b33` (ME-01), and the Milei mega-market `YIydLTsKEdwHoIRmqkdc` (Indiana Questions 1 and 2).
- Preserve the handoff's search fix: paginate with `sort=newest` and `beforeTime`, overlapping the boundary millisecond and deduplicating IDs. The API rejects offsets above 1,000. Stalled/incomplete pagination fails closed.
- Integration follow-up: load state after taking the lock; persist seed mismatches and unreadable seed prices with the created market's full cost, blocking reruns until reviewed. Check reconciled markets too, and stop on resumes with an unconfirmed create. These paths have additional regression coverage.
- Remaining search limitation: the server still returns HTTP 200 empty lists for database query failures. The smaller page size reduces timeout risk; it does not make failed searches distinguishable from successful empty searches. The supplied read-only online recheck was reported clean around 10:40 UTC; integration did not repeat the full database or online audit.

Validation: the supplied patch passed all 48 creation tests locally; with the integration regressions, 51 pass. Both offline manifests validate without errors: 102 ballot creations / 20 unresolved, and 225 race creations / 4 unresolved. Focused CLI type checking passes. Earlier UI validation covered 41 election/ballot model tests, full web type checking, independent-answer and binary complements, disputed sources, no-measures states and responsive controls. No tests establish settlement equivalence beyond the reviewed source evidence.
