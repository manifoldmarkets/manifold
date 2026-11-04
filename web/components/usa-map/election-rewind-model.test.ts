import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { PROBS_HISTORY_MAX_WINDOW_MS } from 'common/market-probs-history'
import { HOUR_MS } from 'common/util/time'
import {
  formatRewindTime,
  frameAt,
  liveAsOf,
  mergeHistories,
  playbackInterval,
  POLLS_CLOSE_2026,
  REWIND_STEP_MS,
  rewindContractIds,
  rewindPresets,
  rewindStart,
} from './election-rewind-model'
import type { LiveElectionContracts } from './live-election-map'

const binary = (id: string, overrides: Partial<BinaryContract> = {}) =>
  ({
    id,
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    pool: { YES: 100, NO: 300 },
    p: 0.5,
    prob: 0.75,
    createdTime: 0,
    isResolved: false,
    ...overrides,
  } as unknown as BinaryContract)

const live = (contracts: {
  senate?: Record<string, Contract | null>
  houseControl?: Contract | null
}): LiveElectionContracts => ({
  senate: contracts.senate ?? {},
  governor: {},
  house: null,
  additionalHouse: {},
  measures: {},
  houseControl: contracts.houseControl ?? null,
  senateControl: null,
})

test('rewind starts a day back on the step grid', () => {
  const now = POLLS_CLOSE_2026 + 2 * HOUR_MS + 7 * 60_000
  const start = rewindStart(now)
  assert.equal(start % REWIND_STEP_MS, 0)
  assert.equal(start, POLLS_CLOSE_2026 + 2 * HOUR_MS - 24 * HOUR_MS)
})

test('rewind reaches back to the first poll closings while it can', () => {
  assert.equal(rewindStart(POLLS_CLOSE_2026 + 30 * HOUR_MS), POLLS_CLOSE_2026)
  const late = POLLS_CLOSE_2026 + 80 * HOUR_MS
  assert.equal(rewindStart(late), late - 24 * HOUR_MS)
  // Never past the server's window, even a minute before it closes.
  const edge = POLLS_CLOSE_2026 + PROBS_HISTORY_MAX_WINDOW_MS - 60_000
  assert.ok(edge - rewindStart(edge) <= PROBS_HISTORY_MAX_WINDOW_MS)
})

test('presets land on frames inside the history, in time order', () => {
  const start = POLLS_CLOSE_2026 - 4 * HOUR_MS
  const times = Array.from(
    { length: 4 * 30 + 1 },
    (_, i) => start + i * REWIND_STEP_MS
  )
  const presets = rewindPresets(times)
  // 30 hours of frames from 4 hours before the polls closed.
  assert.deepEqual(
    presets.map((p) => p.label),
    ['Polls close', '24h ago', '12h ago', '6h ago', '1h ago']
  )
  assert.equal(times[presets[0].frame], POLLS_CLOSE_2026)
  assert.equal(times[presets[1].frame], times[times.length - 1] - 24 * HOUR_MS)
  assert.deepEqual(rewindPresets([]), [])
})

test('presets on the same frame collapse to one', () => {
  const latest = POLLS_CLOSE_2026 + 24 * HOUR_MS
  const times = [latest - 24 * HOUR_MS, latest]
  assert.deepEqual(
    rewindPresets(times).map((p) => p.label),
    ['Polls close']
  )
})

test('a selected time keeps its frame when the window slides', () => {
  const before = [0, 10, 20, 30]
  const after = [10, 20, 30, 40]
  assert.equal(before[frameAt(before, 20) as number], 20)
  assert.equal(after[frameAt(after, 20) as number], 20)
  assert.equal(frameAt(after, 0), 0)
  assert.equal(frameAt(after, 99), 3)
  assert.equal(frameAt([], 20), undefined)
})

test('merged batches keep only the frames every batch has', () => {
  const merged = mergeHistories([
    { times: [0, 10, 20], markets: { a: { prob: [[0, 0.5]] } } },
    { times: [0, 10], markets: { b: { prob: [[0, 0.2]] } } },
  ])
  assert.deepEqual(merged.times, [0, 10])
  assert.deepEqual(Object.keys(merged.markets).sort(), ['a', 'b'])
  assert.deepEqual(mergeHistories([]).times, [])
})

test('contract ids cover every map market once, sorted', () => {
  const ids = rewindContractIds(
    live({
      senate: { GA: binary('z'), ME: null, NC: binary('a') },
      houseControl: binary('a'),
    })
  )
  assert.deepEqual(ids, ['a', 'z'])
})

test('rewinding re-prices the map markets and hides later ones', () => {
  const history = {
    times: [100, 200],
    markets: {
      ga: {
        prob: [
          [0, 0.4],
          [1, 0.6],
        ] as [number, number][],
      },
    },
  }
  const map = live({
    senate: { GA: binary('ga'), NC: binary('nc', { createdTime: 150 }) },
    houseControl: binary('hc'),
  })
  const past = liveAsOf(map, history, 0)
  assert.ok(
    Math.abs(getDisplayProbability(past.senate.GA as BinaryContract) - 0.4) <
      1e-12
  )
  assert.equal(past.senate.NC, null)
  // No history for the control market: its live odds stay.
  assert.ok(
    Math.abs(
      getDisplayProbability(past.houseControl as BinaryContract) - 0.75
    ) < 1e-12
  )
  const later = liveAsOf(map, history, 1)
  assert.ok(
    Math.abs(getDisplayProbability(later.senate.GA as BinaryContract) - 0.6) <
      1e-12
  )
  assert.notEqual(later.senate.NC, null)
  // The live markets are untouched.
  assert.ok(
    Math.abs(getDisplayProbability(map.senate.GA as BinaryContract) - 0.75) <
      1e-12
  )
})

test('times read in US Eastern time', () => {
  assert.equal(
    formatRewindTime(POLLS_CLOSE_2026 + 3 * HOUR_MS + 15 * 60_000),
    'Tue, Nov 3, 9:15 PM ET'
  )
})

test('playback takes about 12 seconds for a day, within frame limits', () => {
  assert.equal(playbackInterval(97), 12_000 / 97)
  assert.equal(playbackInterval(289), 80)
  assert.equal(playbackInterval(10), 400)
  assert.equal(playbackInterval(0), 400)
})
