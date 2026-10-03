# 2026 election explorer

`election-atlas.json` is a static geometry asset, fetched only when the election
explorer mounts. It contains no market prices or executable third-party code.

Geometry and cartogram coordinates were adapted from Theo Jaffee / MTS:
https://drops.mts.now/midterms/ (September 24, 2026 dataset).
The source TopoJSON is https://drops.mts.now/midterms/us.js and the cartogram
coordinates are the `hex` and `tiles` fields of that page's `data.js`.
The interface credits this source in its methodology dialog.

The atlas uses the reference's 120th Congress district boundaries, including
its redistricting updates and its 2022 Missouri map pending litigation. It
does not automatically follow later boundary changes. Check the source and
district market definitions before replacing the snapshot.

To regenerate, parse the JSON assignments without evaluating JavaScript;
convert `objects.states` and `objects.districts_2027` with `topojson-client`
3.1.0 `feature`. Project with `d3-geo` 3.1.1
`geoAlbersUsa().fitExtent([[20,20],[940,580]], states)` and
`geoPath(projection).digits(1)`. Store each feature's properties, SVG path and
rounded path centroid; retain the source hex and tile coordinates. Assert
435 unique district IDs in both representations.

Prices come from existing Manifold contracts and their subscriptions. The current
prototype starts with the original 68-district market, then falls back to six
state portfolios (116 additional districts) and eight individual markets in
`web/public/data/house-market-data.ts`. The October 1, 2026 search found 192
candidate mappings; it did not establish equivalent resolution criteria, nor
prove that the other 243 districts have no markets anywhere on Manifold.
The October 2 review below adds a ninth individual source that overrides
Alaska's existing portfolio entry without increasing the covered district count.

A subsequent audit of all 15 descriptions, answer sets and 26 public comments
found that the original market uses ballot party affiliation, explicitly includes
Democratic fusion tickets, and settles finally on certified results. Names in
answer labels do not change its party proposition. All six added portfolios have
empty descriptions. CA-7/34 specify the November winner; CO-1 has creator-comment
general-election context; the other individual sources have sparse criteria.
None of the 14 additional sources has established equivalence to the original.
They remain candidate mappings in the prototype, not approved canonical sources.

Party-win NO quotes are stored as `notDem` / `notRep`, displayed as any other
winner, and counted separately from Democratic, Republican and independent
winners. They do not become the opposing party's probability or seat count.
The two chamber-control markets retain their separate D/R control presentation.

Before treating this as a homogeneous party forecast, named-candidate markets
cannot automatically become ballot-party probabilities: replacements, party
switches and an unclassified `Other` answer can change the result. Two Democratic
candidate answers summing to 100% is an answer-set constraint, not a separately
traded 100% Democrat-win proposition. Keep candidate bets separately labelled or
hold these sources out of party totals until the necessary rules are clarified.

Cancelled/invalid quotes fall through to the next source. Independent portfolio
answers are Democrat-win propositions; a NO bet means any non-Democratic winner.
The prototype still sums candidate party tags; the audit above identifies
why that must not be described as verified-equivalent party odds.
Never map primary, vote-margin, conditional, or state-legislature questions.
Unlinked districts stay unpriced; no assumed safe-seat probabilities are added.
Governor ballot coverage is maintained separately from market coverage.

### October 2 market-selection review

This follow-up used public API search, full descriptions and public comments;
no Manifold database MCP connection was available. It is not an exhaustive
inventory of existing markets. Liquidity figures are snapshots, not simulated
trade depth or guarantees about price impact.

- Alaska House now prefers Jack's `who-will-win-the-alaska-house-elect`
  (`9zPhhzEnCc`, liquidity 1,000) over the Dem/Not-Dem portfolio. The description
  explicitly resolves to the November final-round winner, not the primary.
  Answers include Begich (R), Schultz (D), Hill (I) and Other. If unavailable or
  cancelled, the portfolio remains the fallback. Other House priorities stay
  unchanged; this override does not add a newly covered district.
- Iowa Senate now uses Plant's `who-will-win-the-2026-united-states-u09U0PqQSn`
  (`I9QNz9Q2L2`, liquidity 10,000), previously available only as the secondary
  candidate market. The old source `which-party-will-win-the-2026-iowa` has
  liquidity 100 and an empty description. Plant's creator comment establishes
  the post-primary general-election context. Its two answers name Turek and
  Hinson; the description's text export is image-only. Replacement/third-party
  settlement remains unverified, and this is not a generic party-win contract.
- Governor coverage adds Michigan, Florida, Kansas, Ohio and Oregon (19 of 36
  scheduled states linked). Michigan's `who-will-the-2026-michigan-governor`
  (`LE6s82ZcAp`) names party nominees, Duggan and Other and says to resolve to
  the winner. Florida's `will-a-republican-win-the-florida-g`
  (`uODgxBgIoHZWqFqHGPbe`) explicitly asks whether a Republican wins the election;
  NO still means any other winner. Kansas (`NI8z9LLtR5`), Ohio (`tyqgQCS0zd`) and
  Oregon (`InE0tLCOC0`) are named-candidate general-election winner markets;
  their descriptions link the corresponding election and creator comments
  request dashboard inclusion. They do not specify replacement/cancellation
  edge cases. Each newly selected governor market had liquidity 1,000.
- Alaska Senate's current source (`0L8uQURR06`) has liquidity 200. Plant's
  `will-dan-sullivan-win-reelection-to` (`ULun8EOAAn`) has liquidity 1,000 and
  explicit official-result criteria, but asks about Sullivan personally.
  It must not be dropped into a component that labels YES as every Republican
  winner. The source remains unchanged pending an explicit candidate-binary
  presentation or a suitable party market.
- AndrewG's Senate-control market says seats won in the 2026 elections, with
  a Republican VP tiebreak at 50 and expected caucusing for elected independents.
  It does not explicitly specify treatment of later party switches. Jack's
  public comment asks that question without a creator answer visible in the
  page reviewed. Keep that ambiguity open rather than promise a particular
  resolution. No market criteria, subsidies or balances were changed.

Every race source and chamber-control card offers a separate description and
comments link in a new tab; the trade actions still open their in-page dialogs.
Candidate-party aggregation remains subject to the limitation above.

Senate totals include the 65 seats not on the ballot (34 Democratic caucus,
31 Republican). Independent race outcomes remain separate.

The pure model tests can be run from the repository root with `ts-node`
and `tsconfig-paths` already present in the repository. Set
`TS_NODE_PROJECT=web/tsconfig.json` and
`TS_NODE_COMPILER_OPTIONS={"module":"CommonJS","moduleResolution":"node"}`,
then run:

```
node -r ts-node/register/transpile-only -r tsconfig-paths/register --test web/components/usa-map/election-map-model.test.ts web/components/usa-map/election-incumbents.test.ts
```

Visual checks: desktop and narrow widths; House geographic/hex maps; Senate
and Governor state tiles; labels; search (including at-large seats); filters;
zoom/pan/reset; race selection by mouse, touch and keyboard; closing details;
methodology; a missing atlas; and missing/cancelled market prices. The chamber
cards and district choices open the existing betting dialogs. Polling cards
open the existing perpetual trading flow, preserving position, oracle freshness,
and risk checks. Chamber tabs stay sticky within the explorer on all screen
sizes. The compact balance strip pins above a single row containing the original
chamber icons, view toggle, labels, search and zoom. At narrow container widths,
the chamber tabs become a labelled selector and search opens inline below the
row. There is no scroll-triggered resizing. The map height is capped to fit the
viewport. Compact chamber-control cards sit outside the map section and scroll
away above the tabs, aligned left. Their small top-right chart links open the market, while
each party button opens an in-page trade. Labels default on; map guidance is
available through the More info footnote. States with
no Senate or gubernatorial election can be selected in either map view: they
highlight, show sitting officeholders on hover and selection, explain that the
office is not on the ballot, and offer a shortcut to that state's House districts.
Their colored crosshatching shows current party control (purple for a split
Senate delegation), distinct from an unpriced race's gray hatching. White map
borders remain visible in dark mode, with dark borders in light mode. Race
details retain dragging, keyboard movement and reset after moving; the collapse
option is removed. Each source's small chart link sits in its heading.

Incumbent context covers all 435 current House districts (including vacancies),
all 100 senators and all 50 governors. Sources checked October 3, 2026:

- House: https://clerk.house.gov/xml/lists/MemberData.xml, published October 1.
  `election-house-incumbents.json` retains only the official name, party and
  current district key from each voting-state member, with `null` for vacancies.
  At-large seats use district zero; territories and DC are excluded. Current
  district numbers refer to the 119th Congress, not a claim that the same member
  is running within the atlas's redrawn 2026 boundaries.
- Senate: https://www.senate.gov/senators/. Class II incumbents plus Florida and
  Ohio's Class III special-election incumbents are recorded in
  `election-incumbents.ts`; other seats reuse `currentSenate2026` and
  `senateHeldSeats2026`. Actual independent affiliations remain visible.
- Governors: https://www.nga.org/governors/ and its linked roster, recorded in
  `election-incumbents.ts` for both scheduled and off-ballot states.

These are static context snapshots to refresh when officeholders change, never
assumed odds for unlinked races; they do not alter priced seat estimates.
The balance bar separates held Senate seats (34 Democratic caucus, 31 Republican)
from safe forecasts with hatching and a divider at each end. Forecast D tiers
run left-to-right toward the uncertain middle, with R tiers toward the right.
All 435 House seats are up in 2026: missing markets remain unpriced, never held.
Duplicate race lists below the map have been removed.

Answer and binary betting dialogs label the currently selected outcome's quote;
quick-bet projections and limit-order inputs use that same side's probability.
Switching sides resets the limit price to the newly selected side, while the
stored bet outcome and answer ID remain unchanged. Check both sides of MT-1,
another district portfolio, WI-7, and chamber controls without submitting bets.
