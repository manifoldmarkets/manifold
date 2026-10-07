import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  balanceSegments,
  Race,
  raceTier,
  seatSummary,
  Tier,
  TIERS,
} from './election-map-model'
import {
  activePreset,
  countLeaders,
  describeTiers,
  dragSelection,
  inSelection,
  leaderSplit,
  PRESETS,
  presetTiers,
  raceLeader,
  sameTiers,
  sortTiers,
  tierRange,
  toggleTier,
} from './seat-bar-selection'

// The House bar's groups, left to right, as balanceSegments draws them.
const HOUSE: Tier[] = [
  'fixed-d',
  'safe-d',
  'likely-d',
  'lean-d',
  'tossup',
  'unpriced',
  'lean-r',
  'likely-r',
  'safe-r',
  'fixed-r',
]
// A Senate bar with no one-party ballots and no toss-ups.
const SENATE: Tier[] = ['safe-d', 'likely-d', 'lean-d', 'lean-r', 'safe-r']

const preset = (id: string) => PRESETS.find((p) => p.id === id)!

test('clicking toggles one group in or out, keeping bar order', () => {
  let s = toggleTier([], 'lean-r', HOUSE)
  assert.deepEqual(s, ['lean-r'])
  s = toggleTier(s, 'safe-d', HOUSE)
  s = toggleTier(s, 'tossup', HOUSE)
  assert.deepEqual(s, ['safe-d', 'tossup', 'lean-r'])
  s = toggleTier(s, 'tossup', HOUSE)
  assert.deepEqual(s, ['safe-d', 'lean-r'])
  assert.deepEqual(toggleTier(['lean-r'], 'lean-r', HOUSE), [])
})

test('sortTiers dedupes and puts groups missing from the bar last', () => {
  assert.deepEqual(sortTiers(['safe-r', 'other', 'safe-d', 'safe-r'], HOUSE), [
    'safe-d',
    'safe-r',
    'other',
  ])
  assert.ok(sameTiers(['a' as Tier, 'b' as Tier], ['b' as Tier, 'a' as Tier]))
  assert.ok(!sameTiers(['safe-d'], ['safe-d', 'likely-d']))
})

test('a range covers every segment between two groups, either direction', () => {
  assert.deepEqual(tierRange(HOUSE, 'lean-d', 'lean-r'), [
    'lean-d',
    'tossup',
    'unpriced',
    'lean-r',
  ])
  assert.deepEqual(
    tierRange(HOUSE, 'lean-r', 'lean-d'),
    tierRange(HOUSE, 'lean-d', 'lean-r')
  )
  assert.deepEqual(tierRange(HOUSE, 'tossup', 'tossup'), ['tossup'])
  // A group that is not on this bar has no range.
  assert.deepEqual(tierRange(SENATE, 'tossup', 'lean-r'), [])
})

test('dragging from an unselected group adds the swept range', () => {
  assert.deepEqual(dragSelection([], HOUSE, 'lean-d', 'lean-r'), [
    'lean-d',
    'tossup',
    'unpriced',
    'lean-r',
  ])
  // On top of what was already selected.
  assert.deepEqual(dragSelection(['safe-r'], HOUSE, 'likely-d', 'lean-d'), [
    'likely-d',
    'lean-d',
    'safe-r',
  ])
  // Sweeping back over the start leaves just the start, like a click.
  assert.deepEqual(dragSelection([], HOUSE, 'tossup', 'tossup'), ['tossup'])
})

test('dragging from a selected group removes the swept range', () => {
  const base: Tier[] = ['safe-d', 'likely-d', 'lean-d', 'tossup']
  assert.deepEqual(dragSelection(base, HOUSE, 'tossup', 'likely-d'), ['safe-d'])
  // Unselected groups inside the sweep stay unselected.
  assert.deepEqual(dragSelection(['tossup'], HOUSE, 'tossup', 'lean-r'), [])
  // A drag always starts from the selection it began with.
  assert.deepEqual(dragSelection(base, HOUSE, 'tossup', 'tossup'), [
    'safe-d',
    'likely-d',
    'lean-d',
  ])
})

test('a drag over a group not on the bar changes nothing', () => {
  assert.deepEqual(dragSelection(['safe-d'], SENATE, 'tossup', 'safe-r'), [
    'safe-d',
  ])
})

test('presets use only the groups this bar shows, in bar order', () => {
  assert.deepEqual(presetTiers(preset('competitive'), HOUSE), [
    'lean-d',
    'tossup',
    'lean-r',
  ])
  assert.deepEqual(presetTiers(preset('competitive'), SENATE), [
    'lean-d',
    'lean-r',
  ])
  // Likely+ counts seats only one party is on the ballot for.
  assert.deepEqual(presetTiers(preset('likely-d'), HOUSE), [
    'fixed-d',
    'safe-d',
    'likely-d',
  ])
  assert.deepEqual(presetTiers(preset('likely-r'), HOUSE), [
    'likely-r',
    'safe-r',
    'fixed-r',
  ])
  assert.deepEqual(presetTiers(preset('likely-r'), ['safe-d']), [])
})

test('a selection equal to a preset marks that preset as active', () => {
  assert.equal(activePreset([], HOUSE), undefined)
  assert.equal(
    activePreset(['lean-r', 'tossup', 'lean-d'], HOUSE)?.id,
    'competitive'
  )
  assert.equal(activePreset(['lean-d', 'lean-r'], SENATE)?.id, 'competitive')
  // A partial or larger selection is not the preset.
  assert.equal(activePreset(['lean-d', 'tossup'], HOUSE), undefined)
  assert.equal(
    activePreset(['lean-d', 'tossup', 'lean-r', 'unpriced'], HOUSE),
    undefined
  )
  assert.equal(
    activePreset(['fixed-d', 'safe-d', 'likely-d'], HOUSE)?.id,
    'likely-d'
  )
})

test('the Likely+ presets are contiguous on the real bar order', () => {
  // Every group drawn, in the order balanceSegments draws them.
  const order = balanceSegments({
    counts: Object.fromEntries(TIERS.map((t) => [t.id, 1])),
    held: { dem: 0, rep: 0 },
  } as ReturnType<typeof seatSummary>).map((s) => s.tier as Tier)
  assert.equal(order.length, TIERS.length)
  for (const id of ['likely-d', 'likely-r']) {
    const tiers = presetTiers(preset(id), order)
    assert.equal(tiers.length, 3)
    assert.deepEqual(tierRange(order, tiers[0], tiers[2]), tiers)
  }
  // Competitive brackets only the uncertain middle of the bar.
  const [from, , to] = presetTiers(preset('competitive'), order)
  assert.deepEqual(tierRange(order, from, to), [
    'lean-d',
    'tossup',
    'other',
    'not-d',
    'not-r',
    'unknown',
    'unpriced',
    'lean-r',
  ])
})

test('selections describe themselves, compressing long runs', () => {
  assert.equal(describeTiers([], HOUSE), '')
  assert.equal(
    describeTiers(['likely-d', 'safe-d'], HOUSE),
    'Safe D + Likely D'
  )
  assert.equal(
    describeTiers(['lean-d', 'tossup', 'lean-r'], HOUSE),
    'Lean D + Toss-up + Lean R'
  )
  assert.equal(
    describeTiers(['lean-d', 'tossup', 'unpriced', 'lean-r'], HOUSE),
    'Lean D to Lean R'
  )
  assert.equal(
    describeTiers(
      ['fixed-d', 'safe-d', 'likely-d', 'lean-d', 'safe-r', 'fixed-r'],
      HOUSE
    ),
    'Only D on ballot to Lean D + Safe R + Only R on ballot'
  )
  assert.equal(describeTiers(['unpriced'], HOUSE), 'No odds yet')
})

const race = (odds?: Race['odds']): Pick<Race, 'odds'> => ({ odds })

test('each listed race has one leader, as the map colors it', () => {
  assert.equal(raceLeader(race({ dem: 0.8, rep: 0.2, other: 0 })), 'dem')
  assert.equal(raceLeader(race({ dem: 0.45, rep: 0.55, other: 0 })), 'rep')
  assert.equal(raceLeader(race({ dem: 0.502, rep: 0.498, other: 0 })), 'even')
  assert.equal(raceLeader(race({ dem: 0.2, rep: 0.1, other: 0.7 })), 'other')
  assert.equal(
    raceLeader(race({ dem: 0, rep: 0.3, other: 0, notRep: 0.7 })),
    'other'
  )
  assert.equal(raceLeader(race()), 'unpriced')
})

test('the party split only shows when the races are mixed', () => {
  const counts = countLeaders([
    race({ dem: 0.55, rep: 0.45, other: 0 }),
    race({ dem: 0.65, rep: 0.35, other: 0 }),
    race({ dem: 0.4, rep: 0.6, other: 0 }),
    race({ dem: 0.5, rep: 0.5, other: 0 }),
  ])
  assert.deepEqual(counts, { dem: 2, rep: 1, other: 0, even: 1, unpriced: 0 })
  assert.deepEqual(
    leaderSplit(counts).map((p) => p.text),
    ['D 2', 'R 1', '1 even']
  )
  assert.deepEqual(
    leaderSplit(countLeaders([race({ dem: 0.95, rep: 0.05, other: 0 })])),
    []
  )
  assert.deepEqual(leaderSplit(countLeaders([])), [])
})

test('the union of selected groups is what the map and list show', () => {
  const races: Race[] = [
    ['A', 0.95],
    ['B', 0.8],
    ['C', 0.65],
    ['D', 0.55],
    ['E', 0.2],
    ['F', 0.05],
  ].map(([id, dem]) => ({
    id: id as string,
    state: id as string,
    label: id as string,
    shortLabel: id as string,
    odds: { dem: dem as number, rep: 1 - (dem as number), other: 0 },
  }))
  const pick = (selection: Tier[]) =>
    races.filter((r) => inSelection(selection, raceTier(r))).map((r) => r.id)
  assert.deepEqual(pick([]), ['A', 'B', 'C', 'D', 'E', 'F'])
  assert.deepEqual(pick(['safe-d', 'likely-d']), ['A', 'B'])
  assert.deepEqual(pick(['lean-d', 'tossup', 'lean-r']), ['C', 'D'])
  assert.deepEqual(pick(['likely-r', 'safe-r']), ['E', 'F'])
  // Groups with no races add nothing.
  assert.deepEqual(pick(['other']), [])
})
