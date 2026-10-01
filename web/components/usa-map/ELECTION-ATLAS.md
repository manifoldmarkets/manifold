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
Senate totals include the 65 seats not on the ballot (34 Democratic caucus,
31 Republican). Independent race outcomes remain separate.

The pure model tests can be run from the repository root with `ts-node`
and `tsconfig-paths` already present in the repository. Set
`TS_NODE_PROJECT=web/tsconfig.json` and
`TS_NODE_COMPILER_OPTIONS={"module":"CommonJS","moduleResolution":"node"}`,
then run:

```
node -r ts-node/register/transpile-only -r tsconfig-paths/register --test web/components/usa-map/election-map-model.test.ts
```

Visual checks: desktop and narrow widths; House geographic/hex maps; Senate
and Governor state tiles; labels; search (including at-large seats); filters;
zoom/pan/reset; race selection by mouse, touch and keyboard; closing details;
methodology; a missing atlas; and missing/cancelled market prices. The chamber
cards and district choices open the existing betting dialogs. Polling cards
open the existing perpetual trading flow, preserving position, oracle freshness,
and risk checks. Chamber tabs stay sticky within the explorer on all screen
sizes; their illustrations disappear when pinned. Desktop map tools stay below
that bar, with zoom at the top right, and the map height is capped to fit the
viewport. Larger chamber-control cards scroll away above the tabs. States with
no Senate or gubernatorial election can be selected in either map view: they
highlight, explain that the office is not on the ballot, and offer a shortcut
to that state's House districts. This is distinct from an unpriced race.
Duplicate race lists below the map have been removed.

Answer and binary betting dialogs label the currently selected outcome's quote;
quick-bet projections and limit-order inputs use that same side's probability.
Switching sides resets the limit price to the newly selected side, while the
stored bet outcome and answer ID remain unchanged. Check both sides of MT-1,
another district portfolio, WI-7, and chamber controls without submitting bets.
