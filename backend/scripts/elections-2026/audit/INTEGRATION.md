# October 3 audit integration

The files in this directory preserve the read-only audit supplied by the user.
Its database snapshot was October 3, 2026, 00:50–00:58 UTC. The report and
recommended-source table describe the proposal, not proof that every source
has equivalent settlement rules. Several entries marked confirmed have empty
descriptions; the frontend conservatively marks those conditional.

## Implemented

- Link 16 previously unlinked governor states, including Minnesota with explicit
  YES = Democratic support. Rhode Island remains unlinked. Replace Colorado,
  Iowa and Kansas with the recommended party sources. Remove the stale New York
  candidate card and use the reviewed California candidate card.
- Replace Maine Senate with Jack1's deeper Democratic-win binary and Ohio with
  the party market explicitly covering the special election. Remove the stale
  Maine candidate card. Preserve independent affiliations in Idaho and South Dakota.
- Add California candidate markets, including the regular-election CA-11 source
  rather than the unrelated 2029 “next person” contract. All nine same-party
  districts remain selectable. CA-12 prefers the Joyce binary, falling back to
  Jack1's candidate multi if unavailable. CA-29 has no candidate market yet.
- Count the nine California seats by certified ballot composition, and FL-10 by
  its unopposed status. Label these separately from market probabilities and safe
  forecasts; missing/cancelled candidate contracts do not erase the ballot basis.
- Add the audited House leads and prefer Jack1's Texas portfolio after the
  original portfolio. Map only the two reviewed Midwest portfolio answer IDs
  (MN-2 and OH-10), without extending the parser to unreviewed labels.
- Read party-binary orientation and candidate answer affiliations from audited
  contract/answer IDs. Candidate binaries never feed party totals. Unknown,
  withdrawn and mixed candidate outcomes are unclassified, not independent wins.
- Use the same interpretation for homepage/OG map colors and popup trade labels.
  Preserve every candidate answer in the popup, including answers beyond five.
  The Senate-control NO option says Not Republican, since it is not a separate
  Democratic-control proposition. The source's party-switch cutoff is unresolved.

## Deliberate differences from the proposal

Alaska Senate retains `0L8uQURR06` until its named Republican answer is clarified
or a suitable replacement has usable depth. The proposed `hPnINuRzt8` reduces
liquidity from 200 to 100 and has no standing orders without the recommended
subsidy. No subsidy is authorized. Plant's `ULun8EOAAn` is offered separately as
a candidate binary: incumbent Dan S. Sullivan versus any other winner, including
other Republicans. The existing party market's ambiguity is visible in its popup.

The audit helper grouped unknown/withdrawn outcomes with independent winners;
the integration keeps an unclassified bucket. The supplied patch also left the
binary betting labels and homepage NO interpretation unchanged; both are fixed.
Ballot-derived seats never display a fabricated 100% party-market quote.

## Remaining limitations

Candidate multi markets remain candidate-based estimates when grouped by party;
replacements, unlisted winners, cancellation and certification rules can differ.
Title-only state portfolios remain conditional. Iowa Senate's two-candidate
market has no Other answer and only a polling-image description. The audit did
not establish a creator ruling for post-election party switches in AndrewG's
Senate-control market. No creator has been contacted by this integration.

The audit found 225 creation candidates (224 House plus Rhode Island governor)
and four additional uncontested House drafts held for review. These are a
snapshot, not a guarantee that markets created later do not exist. No market has
been created, subsidized, edited, or traded.

## Creation handoff

The manifest's payload review remains unapproved, with no creator account selected.
The user accepted the 306,000 mana budget on October 3 (version 2026-10-03.3):
216 House markets at 1,000, eight closer House markets at 10,000, and Rhode Island
governor at 10,000. This excludes ballot measures and existing-market subsidies.
Version 2026-10-03.2
changes proposed closing times to after election night and through the scheduled
Georgia/Louisiana runoffs. Seeds are starting pool values, not market forecasts.

The imported CLI defaults to an offline dry run. Duplicate searches now paginate
and fail closed if they cannot advance; apply rejects infinite spending caps.
Before applying, rerun the online search and review all payloads, seeded prices,
closing times, disputed ballot information, creator identity and spending caps.
Use a single apply process/state file. No apply command was run during integration.

## Evidence

- `recommended-sources.json`: source/answer IDs, propositions, caveats and evidence.
- `race-inventory.json`: the full 506-race inventory.
- `official-source-verification.json` and `notes/`: ballot and resolution checks.
- `subsidy-recommendations.json`: proposals only; the creation CLI does not apply these.
- California: https://elections.cdn.sos.ca.gov/statewide-elections/2026-general/cert-list-candidates.pdf
- Florida: https://dos.elections.myflorida.com/candidates/CanDetail.asp?account=89909

The integration rechecked the current Alaska party/candidate and CA-12 fallback
definitions through the public API. The Florida official page independently
confirmed Frost's unopposed status. California's official PDF was too large for
the browser extraction tool; its ballot evidence comes from the supplied audit.

## Validation

- 32 election model, incumbent and audited-source tests pass; 22 creation tests
  pass with mocked requests. These verify implementation, not settlement equivalence.
- Full web TypeScript and focused creation CLI/simulation TypeScript checks pass.
  Targeted web lint passes with the existing two unused-variable warnings in
  `binary-party-panel.tsx`. Prettier and diff whitespace checks pass.
- Offline dry run: zero validation errors, 225 planned creations, four held for
  review, 306,000 mana. No online bulk duplicate rerun or apply was performed.
- Local browser checks: 35/36 governor states linked; Maine and Minnesota use
  Democratic YES labels; CA-12 and AL-2 use named-candidate YES labels; NO says
  any other winner. CA-11 shows all nine answers; CA-29 remains selectable without
  a market; CA-40 counts by Republican ballot; FL-10 explains its unopposed status.
  Mobile CA-12 fits at 390px without page overflow. Logged-in trade submission
  was not tested during this integration.
