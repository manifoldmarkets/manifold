import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BarGroup,
  balanceSegments,
  buildRaces,
  Race,
  raceTier,
  seatSummary,
} from './election-map-model'
import { heldSeats } from './election-incumbents'
import {
  countLeaders,
  describeGroups,
  dragSelection,
  groupRange,
  heldInSelection,
  inSelection,
  leaderSplit,
  raceLeader,
  sortGroups,
  toggleGroup,
} from './seat-bar-selection'

// The House bar's groups, left to right, as balanceSegments draws them.
const HOUSE: BarGroup[] = [
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
// A Senate bar: held seats at both ends, no toss-ups.
const SENATE: BarGroup[] = [
  'held-dem',
  'safe-d',
  'likely-d',
  'lean-d',
  'lean-r',
  'safe-r',
  'held-rep',
]

test('clicking toggles one group in or out, keeping bar order', () => {
  let s = toggleGroup([], 'lean-r', HOUSE)
  assert.deepEqual(s, ['lean-r'])
  s = toggleGroup(s, 'safe-d', HOUSE)
  s = toggleGroup(s, 'tossup', HOUSE)
  assert.deepEqual(s, ['safe-d', 'tossup', 'lean-r'])
  s = toggleGroup(s, 'tossup', HOUSE)
  assert.deepEqual(s, ['safe-d', 'lean-r'])
  assert.deepEqual(toggleGroup(['lean-r'], 'lean-r', HOUSE), [])
})

test('held seats toggle like any other group', () => {
  let s = toggleGroup([], 'lean-d', SENATE)
  s = toggleGroup(s, 'held-rep', SENATE)
  s = toggleGroup(s, 'held-dem', SENATE)
  assert.deepEqual(s, ['held-dem', 'lean-d', 'held-rep'])
  assert.deepEqual(toggleGroup(s, 'held-dem', SENATE), ['lean-d', 'held-rep'])
})

test('sortGroups dedupes and puts groups missing from the bar last', () => {
  assert.deepEqual(sortGroups(['safe-r', 'other', 'safe-d', 'safe-r'], HOUSE), [
    'safe-d',
    'safe-r',
    'other',
  ])
  assert.deepEqual(sortGroups(['held-rep', 'safe-d', 'held-dem'], SENATE), [
    'held-dem',
    'safe-d',
    'held-rep',
  ])
})

test('a range covers every segment between two groups, either direction', () => {
  assert.deepEqual(groupRange(HOUSE, 'lean-d', 'lean-r'), [
    'lean-d',
    'tossup',
    'unpriced',
    'lean-r',
  ])
  assert.deepEqual(
    groupRange(HOUSE, 'lean-r', 'lean-d'),
    groupRange(HOUSE, 'lean-d', 'lean-r')
  )
  assert.deepEqual(groupRange(HOUSE, 'tossup', 'tossup'), ['tossup'])
  // Held seats are ends of the Senate bar like any segment.
  assert.deepEqual(groupRange(SENATE, 'held-dem', 'likely-d'), [
    'held-dem',
    'safe-d',
    'likely-d',
  ])
  // A group that is not on this bar has no range.
  assert.deepEqual(groupRange(SENATE, 'tossup', 'lean-r'), [])
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
  // From the held Republican seats inward.
  assert.deepEqual(dragSelection([], SENATE, 'held-rep', 'lean-r'), [
    'lean-r',
    'safe-r',
    'held-rep',
  ])
})

test('dragging from a selected group removes the swept range', () => {
  const base: BarGroup[] = ['safe-d', 'likely-d', 'lean-d', 'tossup']
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

test('every segment on the real bars is selectable', () => {
  for (const mode of ['house', 'senate', 'governor'] as const) {
    const segments = balanceSegments(seatSummary(buildRaces(mode, {}), mode))
    for (const s of segments) assert.equal(s.group, s.id, `${mode} ${s.id}`)
  }
  const senate = balanceSegments(
    seatSummary(buildRaces('senate', {}), 'senate')
  ).map((s) => s.group)
  assert.equal(senate[0], 'held-dem')
  assert.equal(senate[senate.length - 1], 'held-rep')
})

test('selections describe themselves, compressing long runs', () => {
  assert.equal(describeGroups([], HOUSE), '')
  assert.equal(
    describeGroups(['likely-d', 'safe-d'], HOUSE),
    'Safe D + Likely D'
  )
  assert.equal(
    describeGroups(['lean-d', 'tossup', 'lean-r'], HOUSE),
    'Lean D + Toss-up + Lean R'
  )
  assert.equal(
    describeGroups(['lean-d', 'tossup', 'unpriced', 'lean-r'], HOUSE),
    'Lean D to Lean R'
  )
  assert.equal(
    describeGroups(
      ['fixed-d', 'safe-d', 'likely-d', 'lean-d', 'safe-r', 'fixed-r'],
      HOUSE
    ),
    'Only D on ballot to Lean D + Safe R + Only R on ballot'
  )
  assert.equal(describeGroups(['unpriced'], HOUSE), 'No odds yet')
  assert.equal(
    describeGroups(['held-rep', 'lean-d', 'held-dem'], SENATE),
    'Held D + Lean D + Held R'
  )
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

test('the party split only shows when the seats are mixed', () => {
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
  // Held seats count for the caucus that holds them.
  assert.deepEqual(
    countLeaders(
      [race({ dem: 0.5, rep: 0.5, other: 0 })],
      [{ side: 'dem' }, { side: 'dem' }, { side: 'rep' }]
    ),
    { dem: 2, rep: 1, other: 0, even: 1, unpriced: 0 }
  )
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
  const pick = (selection: BarGroup[]) =>
    races.filter((r) => inSelection(selection, raceTier(r))).map((r) => r.id)
  assert.deepEqual(pick([]), ['A', 'B', 'C', 'D', 'E', 'F'])
  assert.deepEqual(pick(['safe-d', 'likely-d']), ['A', 'B'])
  assert.deepEqual(pick(['lean-d', 'tossup', 'lean-r']), ['C', 'D'])
  assert.deepEqual(pick(['likely-r', 'safe-r']), ['E', 'F'])
  // Groups with no races add nothing; held groups select no races.
  assert.deepEqual(pick(['other']), [])
  assert.deepEqual(pick(['held-dem']), [])
})

test('held seats list only when their group is selected', () => {
  const seats = heldSeats('senate')
  const listed = (selection: BarGroup[]) =>
    seats.filter((s) => heldInSelection(selection, s))
  assert.equal(listed([]).length, 0)
  assert.equal(listed(['safe-d', 'tossup']).length, 0)
  assert.equal(listed(['held-dem']).length, 34)
  assert.equal(listed(['held-rep']).length, 31)
  assert.equal(listed(['held-dem', 'held-rep', 'tossup']).length, 65)
  // Colorado has a race and a held seat: each is listed once, as itself.
  assert.deepEqual(
    listed(['held-dem'])
      .filter((s) => s.state === 'CO')
      .map((s) => s.member.name),
    ['Michael Bennet']
  )
  // Vermont has no race: both senators are held seats.
  assert.deepEqual(
    listed(['held-dem'])
      .filter((s) => s.state === 'VT')
      .map((s) => s.member.party)
      .sort(),
    ['Democrat', 'Independent']
  )
})
