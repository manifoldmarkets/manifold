import { mapValues } from 'lodash'
import { answerP } from 'common/answer'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { Contract, isMultiCpmm } from 'common/contract'
import {
  marketProbsAtFrame,
  MarketProbs,
  MarketProbsHistory,
  ProbChangePoints,
} from 'common/market-probs-history'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { formatOdds } from 'web/components/usa-map/election-display'
import { POLLS_CLOSE_2026 } from 'web/components/usa-map/election-rewind-model'

// The 2026 midterms replay on /election2026: the map's odds from a week
// before the first polls closed through election night, in stages that end
// at milestones. Each stage plays in about the same time however long it
// spans, so the quiet week takes no longer than an hour of election night.

export type ReplayMilestoneSpec = {
  id: string
  label: string
  // For the one-line milestone buttons.
  short: string
  note?: string
  // From the first poll closings, 6 PM ET on November 3.
  offsetMs: number
  // Frame spacing in the stage that ends here (unused for the first).
  stepMs: number
}

export const REPLAY_MILESTONES: ReplayMilestoneSpec[] = [
  {
    id: 'week',
    label: '1 week out',
    short: '1 week',
    offsetMs: -7 * DAY_MS,
    stepMs: 0,
  },
  {
    id: 'day',
    label: '1 day out',
    short: '1 day',
    offsetMs: -DAY_MS,
    stepMs: 6 * HOUR_MS,
  },
  {
    id: '12h',
    label: '12 hours out',
    short: '12h',
    note: 'Polls are opening in the East',
    offsetMs: -12 * HOUR_MS,
    stepMs: 30 * MINUTE_MS,
  },
  {
    id: '6h',
    label: '6 hours out',
    short: '6h',
    offsetMs: -6 * HOUR_MS,
    stepMs: 15 * MINUTE_MS,
  },
  {
    id: '3h',
    label: '3 hours out',
    short: '3h',
    offsetMs: -3 * HOUR_MS,
    stepMs: 10 * MINUTE_MS,
  },
  {
    id: '1h',
    label: '1 hour out',
    short: '1h',
    offsetMs: -HOUR_MS,
    stepMs: 5 * MINUTE_MS,
  },
  {
    id: 'polls',
    label: 'Polls close',
    short: 'Polls close',
    note: 'The first polls close, in most of Indiana and Kentucky',
    offsetMs: 0,
    stepMs: 5 * MINUTE_MS,
  },
  {
    id: '9pm',
    label: '9 PM ET',
    short: '9 PM',
    offsetMs: 3 * HOUR_MS,
    stepMs: 5 * MINUTE_MS,
  },
  {
    id: 'midnight',
    label: 'Midnight ET',
    short: 'Midnight',
    offsetMs: 6 * HOUR_MS,
    stepMs: 5 * MINUTE_MS,
  },
  {
    id: '6am',
    label: '6 AM ET',
    short: '6 AM',
    note: 'The morning after',
    offsetMs: 12 * HOUR_MS,
    stepMs: 10 * MINUTE_MS,
  },
  {
    id: 'noon',
    label: 'Noon ET',
    short: 'Noon',
    offsetMs: 18 * HOUR_MS,
    stepMs: 15 * MINUTE_MS,
  },
]

export const LATEST_MILESTONE_ID = 'latest'

// A milestone's button label: its spec's short one, else its label.
export const milestoneShortLabel = (m: { id: string; label: string }) =>
  m.id === LATEST_MILESTONE_ID
    ? 'Latest'
    : REPLAY_MILESTONES.find((spec) => spec.id === m.id)?.short ?? m.label

export type ReplayMilestone = {
  id: string
  label: string
  note?: string
  time: number
  frame: number
}

// web/public/data/election-2026-replay.json, written by
// web/scripts/election-2026-replay-snapshot.ts.
export type ReplaySnapshot = MarketProbsHistory & {
  generatedAt: number
  milestones: ReplayMilestone[]
}

// Frame times and milestones up to `end`. Every milestone is a frame. A
// snapshot taken mid-stage ends on a "Latest" milestone at the last frame
// of that stage's grid before `end`.
export function replayPlan(
  specs: ReplayMilestoneSpec[],
  end: number,
  anchor = POLLS_CLOSE_2026
): { times: number[]; milestones: ReplayMilestone[] } {
  const times: number[] = []
  const milestones: ReplayMilestone[] = []
  const stop = (spec: ReplayMilestoneSpec, time: number) =>
    milestones.push({
      id: spec.id,
      label: spec.label,
      ...(spec.note && { note: spec.note }),
      time,
      frame: times.length - 1,
    })
  const first = specs[0]
  if (!first || anchor + first.offsetMs > end) return { times, milestones }
  times.push(anchor + first.offsetMs)
  stop(first, times[0])
  for (const spec of specs.slice(1)) {
    const target = anchor + spec.offsetMs
    const from = times[times.length - 1]
    if (!(spec.stepMs > 0) || target <= from) continue
    for (let t = from + spec.stepMs; t < target && t <= end; t += spec.stepMs)
      times.push(t)
    if (target <= end) {
      times.push(target)
      stop(spec, target)
    } else {
      const last = times[times.length - 1]
      if (last > milestones[milestones.length - 1].time)
        milestones.push({
          id: LATEST_MILESTONE_ID,
          label: 'Latest',
          time: last,
          frame: times.length - 1,
        })
      break
    }
  }
  return { times, milestones }
}

// The stage a frame is in: the index of the last milestone at or before it.
export function stageOf(milestones: ReplayMilestone[], frame: number) {
  let stage = 0
  milestones.forEach((m, i) => {
    if (m.frame <= frame) stage = i
  })
  return stage
}

// The scrubber gives every stage the same width: 100 steps each.
export const SLIDER_STEPS_PER_STAGE = 100

export function sliderMax(milestones: ReplayMilestone[]) {
  return Math.max(0, milestones.length - 1) * SLIDER_STEPS_PER_STAGE
}

export function sliderValue(milestones: ReplayMilestone[], frame: number) {
  const stage = stageOf(milestones, frame)
  const from = milestones[stage]
  const to = milestones[stage + 1]
  if (!from) return 0
  if (!to) return stage * SLIDER_STEPS_PER_STAGE
  const fraction = (frame - from.frame) / (to.frame - from.frame)
  return Math.round((stage + fraction) * SLIDER_STEPS_PER_STAGE)
}

export function frameAtSlider(milestones: ReplayMilestone[], value: number) {
  const last = milestones[milestones.length - 1]
  if (!last) return 0
  const stage = Math.floor(value / SLIDER_STEPS_PER_STAGE)
  const from = milestones[stage]
  const to = milestones[stage + 1]
  if (!from || !to) return last.frame
  const fraction = value / SLIDER_STEPS_PER_STAGE - stage
  return from.frame + Math.round(fraction * (to.frame - from.frame))
}

// The frame a scrubber key moves to. One slider step is less than a frame
// in most stages, so arrows step a frame; Page Up and Down jump between
// milestones, Home and End go to either end. Undefined for other keys.
export function scrubKeyFrame(
  milestones: ReplayMilestone[],
  frame: number,
  last: number,
  key: string
): number | undefined {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return Math.min(last, frame + 1)
    case 'ArrowLeft':
    case 'ArrowDown':
      return Math.max(0, frame - 1)
    case 'PageUp':
      return milestones.find((m) => m.frame > frame)?.frame ?? last
    case 'PageDown':
      return [...milestones].reverse().find((m) => m.frame < frame)?.frame ?? 0
    case 'Home':
      return 0
    case 'End':
      return last
  }
  return undefined
}

// About four seconds a stage, then a beat on each milestone it reaches.
export const STAGE_PLAY_MS = 4_000
export const MILESTONE_HOLD_MS = 1_800

// How long to show `frame` before moving on, while playing. With `hold` on,
// playback pauses on each milestone it reaches; playback that starts on a
// milestone leaves it at once.
export function playbackDelay(
  milestones: ReplayMilestone[],
  frame: number,
  startFrame: number,
  hold = true
) {
  const stage = stageOf(milestones, frame)
  const from = milestones[stage]
  const to = milestones[stage + 1]
  const frames = from && to ? Math.max(1, to.frame - from.frame) : 1
  const step = Math.min(400, Math.max(60, STAGE_PLAY_MS / frames))
  const holding = hold && from && from.frame === frame && frame !== startFrame
  return step + (holding ? MILESTONE_HOLD_MS : 0)
}

const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

// "2 days 6 hours out", "45 min out", "3 hours 15 min after polls closed": a
// frame's time from the first poll closings, to the minute. Short enough
// for one line on a phone.
export function replayCountdown(time: number, anchor = POLLS_CLOSE_2026) {
  const diff = Math.round((time - anchor) / MINUTE_MS) * MINUTE_MS
  if (diff === 0) return 'Polls close'
  const abs = Math.abs(diff)
  const days = Math.floor(abs / DAY_MS)
  const hours = Math.floor((abs % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((abs % HOUR_MS) / MINUTE_MS)
  const parts = days
    ? [unit(days, 'day'), hours ? unit(hours, 'hour') : '']
    : hours
    ? [unit(hours, 'hour'), minutes ? `${minutes} min` : '']
    : [`${minutes} min`]
  const span = parts.filter(Boolean).join(' ')
  return diff < 0 ? `${span} out` : `${span} after polls closed`
}

// The replay opens here, a few hours out, rather than a quiet week back.
export const DEFAULT_MILESTONE_ID = '3h'

export const defaultFrame = (milestones: ReplayMilestone[]) =>
  milestones.find((m) => m.id === DEFAULT_MILESTONE_ID)?.frame ?? 0

// How far apart Manifold and another market were on a chamber, in whole
// points as shown. Once the chamber's market resolved, on the winner: a
// positive gap means Manifold was that much closer to the result. Before,
// on the Democrats. Undefined when the two read the same.
export function chamberGap(
  manifoldRep: number,
  otherRep: number,
  winner?: 'D' | 'R'
) {
  const ours = partySplit(manifoldRep)
  const theirs = partySplit(otherRep)
  const party = winner ?? 'D'
  const share = (s: { rep: number; dem: number }) =>
    party === 'R' ? s.rep : s.dem
  const points = Math.round((share(ours) - share(theirs)) * 100)
  // Odds that read the same (">99%" and ">99%") are even, however far apart
  // past the bound.
  const sameShown = formatOdds(share(ours)) === formatOdds(share(theirs))
  return Number.isFinite(points) && points !== 0 && !sameShown
    ? { points, party, resolved: winner !== undefined }
    : undefined
}

// A chamber's odds for each party, rounded to what formatOdds shows so the
// two add up: rounded apart, 19.5% and 80.5% would read 20% and 81%.
// Past 1% or 99% both sides read as the bounds (<1% and >99%).
export function partySplit(rep: number) {
  const tenths = Math.round(rep * 1000) / 10
  if (tenths < 1 || tenths > 99) return { rep, dem: 1 - rep }
  const shown = Math.round(rep * 100) / 100
  return { rep: shown, dem: 1 - shown }
}

// The probability a market trades at, from its pools, as the snapshot reads
// every series: a resolution rewrites answers' stored prob to 0 or 1, but
// the pools keep the last traded price.
export function contractProbs(contract: Contract): MarketProbs | undefined {
  if (contract.mechanism === 'cpmm-1')
    return { prob: getCpmmProbability(contract.pool, contract.p) }
  if (isMultiCpmm(contract))
    return {
      answerProbs: Object.fromEntries(
        contract.answers.map((a) => [
          a.id,
          getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, answerP(a)),
        ])
      ),
    }
  return undefined
}

const isProb = (p: number | undefined): p is number =>
  p !== undefined && Number.isFinite(p) && p >= 0 && p <= 1

// As the snapshot rounds: 0.01%.
const roundProb = (p: number) => Math.round(p * 10_000) / 10_000

const extend = (
  points: ProbChangePoints,
  frame: number,
  prob: number | undefined
): ProbChangePoints => {
  if (!isProb(prob)) return points
  const rounded = roundProb(prob)
  const last = points[points.length - 1]
  return last && last[1] === rounded ? points : [...points, [frame, rounded]]
}

// The snapshot with one more frame, at `now`, holding every market's odds
// as the page loaded them (`current`, by contract id): its last stop is the
// latest, however old the snapshot. A snapshot's own "Latest" (where a
// mid-plan snapshot stopped) becomes an ordinary frame. Markets or answers
// the snapshot lacks are left to liveAsOf, which shows them live anyway.
export function withLatestFrame(
  snapshot: ReplaySnapshot,
  current: { [contractId: string]: MarketProbs | undefined },
  now: number
): ReplaySnapshot {
  const { times } = snapshot
  if (
    !Number.isFinite(now) ||
    times.length === 0 ||
    now <= times[times.length - 1]
  )
    return snapshot
  const frame = times.length
  return {
    ...snapshot,
    times: [...times, now],
    milestones: [
      ...snapshot.milestones.filter((m) => m.id !== LATEST_MILESTONE_ID),
      {
        id: LATEST_MILESTONE_ID,
        label: 'Latest',
        note: 'The odds now',
        time: now,
        frame,
      },
    ],
    markets: mapValues(snapshot.markets, (series, id) => {
      const probs = current[id]
      if (!probs) return series
      return {
        ...(series.prob && { prob: extend(series.prob, frame, probs.prob) }),
        ...(series.answerProbs && {
          answerProbs: mapValues(series.answerProbs, (points, answerId) =>
            extend(points, frame, probs.answerProbs?.[answerId])
          ),
        }),
      }
    }),
  }
}

// One binary market's probability at a frame, from the snapshot.
export function snapshotProb(
  snapshot: MarketProbsHistory,
  contractId: string | undefined,
  frame: number
) {
  if (!contractId) return undefined
  return marketProbsAtFrame(snapshot.markets[contractId], frame).prob
}
