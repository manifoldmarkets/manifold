import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  contrastRatio,
  DARK_LABEL,
  formatOdds,
  labelInk,
  LIGHT_LABEL,
  looksTied,
  luminance,
  plural,
  shownPercent,
} from './election-display'
import { leadingParty, raceTier } from './election-map-model'
import { partyProbsToColor } from './state-election-map'

test('one formatter: whole percents, one decimal only at the tails', () => {
  assert.equal(formatOdds(0.6), '60%')
  assert.equal(formatOdds(0.5049), '50%')
  assert.equal(formatOdds(0.004), '0.4%')
  assert.equal(formatOdds(0.0094), '0.9%')
  assert.equal(formatOdds(0.0096), '1%')
  assert.equal(formatOdds(0.9899), '99%')
  assert.equal(formatOdds(0.9904), '99%')
  assert.equal(formatOdds(0.994), '99.4%')
  assert.equal(formatOdds(0.99), '99%')
  assert.equal(formatOdds(0.0003), '<0.1%')
  assert.equal(formatOdds(0.9997), '>99.9%')
  assert.equal(formatOdds(0), '0%')
  assert.equal(formatOdds(1), '100%')
  assert.equal(formatOdds(-0.2), '0%')
  assert.equal(formatOdds(NaN), '—')
  assert.equal(formatOdds(Infinity), '—')
})

test('tiers follow the displayed percentage at every boundary', () => {
  // Florida Governor (74.9%) and Kansas Governor (75.1%) both read "75%".
  const below = { dem: 0.251, rep: 0.749, other: 0 }
  const above = { dem: 0.249, rep: 0.751, other: 0 }
  assert.equal(formatOdds(below.rep), formatOdds(above.rep))
  assert.equal(raceTier({ odds: below }), 'likely-r')
  assert.equal(raceTier({ odds: above }), 'likely-r')
  assert.equal(
    raceTier({ odds: { dem: 0.596, rep: 0.404, other: 0 } }),
    'lean-d'
  )
  assert.equal(
    raceTier({ odds: { dem: 0.594, rep: 0.406, other: 0 } }),
    'tossup'
  )
  assert.equal(
    raceTier({ odds: { dem: 0.104, rep: 0.896, other: 0 } }),
    'safe-r'
  )
  assert.equal(shownPercent(0.895), 90)
})

test('a race that reads 50/50 is even, never "R 50%"', () => {
  // Georgia Governor: Republican 50.2%, Democratic 49.8%.
  const georgia = { dem: 0.498, rep: 0.502, other: 0 }
  assert.equal(looksTied(georgia.dem, georgia.rep), true)
  assert.equal(leadingParty(georgia), undefined)
  assert.equal(raceTier({ odds: georgia }), 'tossup')
  assert.equal(leadingParty({ dem: 0.494, rep: 0.506, other: 0 }), 'rep')
  // VA-1's exact tie stays a tie.
  assert.equal(leadingParty({ dem: 0.5, rep: 0.5, other: 0 }), undefined)
})

test('pluralization', () => {
  assert.equal(plural(1, 'matching race'), '1 matching race')
  assert.equal(plural(5, 'matching race'), '5 matching races')
  assert.equal(plural(0, 'measure'), '0 measures')
})

test('labels pick the higher-contrast ink, so pale fills get dark text', () => {
  // Pale and mid-tone fills from the live map (TX, KS, AK, MI) take dark text.
  for (const fill of [
    partyProbsToColor(0.65, 0.35),
    partyProbsToColor(0.34, 0.66),
    partyProbsToColor(0.72, 0.28),
    partyProbsToColor(0.58, 0.42),
    '#d9d2dc',
  ])
    assert.equal(labelInk(fill), DARK_LABEL, fill)
  for (const fill of ['#4a5fa8', '#9d3336', '#318b83'])
    assert.equal(labelInk(fill), LIGHT_LABEL, fill)
  // Across the whole party ramp the pick is the better ink. Mid-tones can't
  // reach 4.5:1 with either, so the map adds a contrasting halo; the floor
  // is the best either ink can do there.
  for (let i = 0; i <= 100; i++) {
    const fill = partyProbsToColor(i / 100, 1 - i / 100)
    const ink = labelInk(fill)!
    const other = ink === DARK_LABEL ? LIGHT_LABEL : DARK_LABEL
    const chosen = contrastRatio(luminance(fill)!, luminance(ink)!)
    assert.ok(
      chosen >= contrastRatio(luminance(fill)!, luminance(other)!),
      `${fill} with ${ink}`
    )
    assert.ok(chosen >= 3.8, `${fill} with ${ink}: ${chosen}`)
  }
  assert.equal(labelInk('url(#pattern)'), undefined)
})
