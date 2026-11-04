import { mapValues, minBy, sortBy, uniq, uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import {
  contractAsOf,
  marketProbsAtFrame,
  MarketProbsHistory,
  PROBS_HISTORY_MAX_WINDOW_MS,
} from 'common/market-probs-history'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import type { LiveElectionContracts } from './live-election-map'

export const REWIND_STEP_MS = 15 * MINUTE_MS
// The first polls close at 6 PM ET on November 3 (Indiana and Kentucky).
export const POLLS_CLOSE_2026 = Date.UTC(2026, 10, 3, 23)

// The rewind's first frame: a day back, or back to the first poll closings
// while the server still serves them. On the step grid, so viewers within
// one step share cached history.
export function rewindStart(now: number) {
  const latest = Math.floor(now / REWIND_STEP_MS) * REWIND_STEP_MS
  const dayAgo = latest - DAY_MS
  const earliest = latest - PROBS_HISTORY_MAX_WINDOW_MS + REWIND_STEP_MS
  return POLLS_CLOSE_2026 >= earliest && POLLS_CLOSE_2026 < dayAgo
    ? POLLS_CLOSE_2026
    : dayAgo
}

export type RewindPreset = { label: string; title: string; frame: number }

// Jumps to the first poll closings and to whole hours before the latest
// frame, for those inside the history. Frames are on a grid that divides an
// hour, so each lands exactly on one.
export function rewindPresets(times: number[]): RewindPreset[] {
  const latest = times[times.length - 1]
  if (latest === undefined) return []
  const candidates = [
    {
      label: 'Polls close',
      title: 'When the first polls closed, 6 PM ET on November 3',
      time: POLLS_CLOSE_2026,
    },
    ...[24, 12, 6, 1].map((hours) => ({
      label: `${hours}h ago`,
      title: `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`,
      time: latest - hours * HOUR_MS,
    })),
  ]
  const presets = candidates.flatMap(({ label, title, time }) => {
    const frame = times.indexOf(time)
    return frame >= 0 ? [{ label, title, frame }] : []
  })
  return sortBy(
    uniqBy(presets, (p) => p.frame),
    (p) => p.frame
  )
}

// The frame showing `time`. Frames sit on a fixed grid, so a refetched
// history keeps the selected time; a time that slid out of the window shows
// the first frame.
export function frameAt(times: number[], time: number) {
  if (times.length === 0) return undefined
  const frame = times.findIndex((t) => t >= time)
  return frame === -1 ? times.length - 1 : frame
}

// One response per batch of ids. Batches answered by different API workers
// can end a frame apart, so keep only the frames every batch has.
export function mergeHistories(
  parts: MarketProbsHistory[]
): MarketProbsHistory {
  return {
    times:
      minBy(
        parts.map((p) => p.times),
        (times) => times.length
      ) ?? [],
    markets: Object.assign({}, ...parts.map((p) => p.markets)),
  }
}

const dictionaryValues = (d: MapContractsDictionary) => Object.values(d)

export function rewindContractIds(live: LiveElectionContracts) {
  const all = [
    ...dictionaryValues(live.senate),
    ...dictionaryValues(live.governor),
    live.house,
    ...dictionaryValues(live.additionalHouse),
    ...dictionaryValues(live.measures),
    live.houseControl,
    live.senateControl,
  ]
  return sortBy(uniq(all.flatMap((c) => (c ? [c.id] : []))))
}

// Every map market as it stood at the frame. A market created later shows
// as unlinked; one missing from the history keeps its live odds.
export function liveAsOf(
  live: LiveElectionContracts,
  history: MarketProbsHistory,
  frame: number
): LiveElectionContracts {
  const time = history.times[frame]
  const asOf = (c: Contract | null) =>
    c
      ? contractAsOf(
          c,
          time,
          marketProbsAtFrame(history.markets[c.id], frame)
        ) ?? null
      : null
  const dictionary = (d: MapContractsDictionary) => mapValues(d, asOf)
  return {
    senate: dictionary(live.senate),
    governor: dictionary(live.governor),
    house: asOf(live.house),
    additionalHouse: dictionary(live.additionalHouse),
    measures: dictionary(live.measures),
    houseControl: asOf(live.houseControl),
    senateControl: asOf(live.senateControl),
  }
}

// US races, so US Eastern time: "Tue, Nov 3, 9:15 PM ET".
export const formatRewindTime = (time: number) =>
  `${new Date(time).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} ET`

// About 12 seconds for a day of 15-minute frames, never faster than the map
// can redraw.
export const playbackInterval = (frames: number) =>
  Math.min(400, Math.max(80, 12_000 / Math.max(1, frames)))
