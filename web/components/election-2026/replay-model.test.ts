import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { formatOdds } from 'web/components/usa-map/election-display'
import { POLLS_CLOSE_2026 } from 'web/components/usa-map/election-rewind-model'
import { Contract } from 'common/contract'
import { marketProbsAtFrame } from 'common/market-probs-history'
import {
  chamberGap,
  contractProbs,
  defaultFrame,
  frameAtSlider,
  LATEST_MILESTONE_ID,
  MILESTONE_HOLD_MS,
  milestoneShortLabel,
  partySplit,
  playbackDelay,
  REPLAY_MILESTONES,
  replayCountdown,
  replayPlan,
  scrubKeyFrame,
  sliderMax,
  sliderValue,
  SLIDER_STEPS_PER_STAGE,
  stageOf,
  withLatestFrame,
} from './replay-model'

const T0 = POLLS_CLOSE_2026

test('the full plan lands every milestone on a frame', () => {
  const end = T0 + 18 * HOUR_MS
  const { times, milestones } = replayPlan(REPLAY_MILESTONES, end)
  assert.deepEqual(
    milestones.map((m) => m.id),
    REPLAY_MILESTONES.map((m) => m.id)
  )
  for (const m of milestones) assert.equal(times[m.frame], m.time)
  assert.equal(times[0], T0 - 7 * DAY_MS)
  assert.equal(times[times.length - 1], end)
  // Ascending, and spaced by each stage's step.
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1])
  const week = milestones[0]
  const day = milestones[1]
  assert.equal(day.frame - week.frame, 24)
  const polls = milestones.find((m) => m.id === 'polls')!
  assert.equal(polls.time, T0)
  assert.equal(times[polls.frame + 1] - T0, 5 * MINUTE_MS)
})

test('a snapshot mid-stage ends on a Latest milestone on the grid', () => {
  const end = T0 + 2 * HOUR_MS + 7 * MINUTE_MS
  const { times, milestones } = replayPlan(REPLAY_MILESTONES, end)
  const latest = milestones[milestones.length - 1]
  assert.equal(latest.id, LATEST_MILESTONE_ID)
  assert.equal(latest.time, T0 + 2 * HOUR_MS + 5 * MINUTE_MS)
  assert.equal(latest.frame, times.length - 1)
  assert.equal(milestones[milestones.length - 2].id, 'polls')
})

test('a snapshot exactly on a milestone has no Latest', () => {
  const { milestones } = replayPlan(REPLAY_MILESTONES, T0)
  assert.equal(milestones[milestones.length - 1].id, 'polls')
})

test('nothing to replay before the first milestone', () => {
  const { times, milestones } = replayPlan(REPLAY_MILESTONES, T0 - 8 * DAY_MS)
  assert.deepEqual(times, [])
  assert.deepEqual(milestones, [])
})

test('stages, slider positions and frames round-trip', () => {
  const { milestones } = replayPlan(REPLAY_MILESTONES, T0 + 6 * HOUR_MS)
  assert.equal(stageOf(milestones, 0), 0)
  assert.equal(stageOf(milestones, 23), 0)
  assert.equal(stageOf(milestones, 24), 1)
  assert.equal(
    sliderMax(milestones),
    (milestones.length - 1) * SLIDER_STEPS_PER_STAGE
  )
  // Every stage gets the same width, whatever its frame count.
  assert.equal(sliderValue(milestones, milestones[1].frame), 100)
  assert.equal(sliderValue(milestones, 12), 50)
  for (const m of milestones)
    assert.equal(
      frameAtSlider(milestones, sliderValue(milestones, m.frame)),
      m.frame
    )
  assert.equal(
    frameAtSlider(milestones, sliderMax(milestones)),
    milestones[milestones.length - 1].frame
  )
})

test('playback holds on milestones it reaches, not the one it starts on', () => {
  const { milestones } = replayPlan(REPLAY_MILESTONES, T0 + 6 * HOUR_MS)
  const day = milestones[1].frame
  const step = playbackDelay(milestones, day + 1, 0)
  assert.equal(playbackDelay(milestones, day, 0), step + MILESTONE_HOLD_MS)
  assert.equal(playbackDelay(milestones, day, day), step)
  // A day of six-hour frames plays as fast as an hour of five-minute ones.
  const week = playbackDelay(milestones, 1, 0)
  assert.ok(week >= 60 && week <= 400)
})

test('with milestone pauses off, playback runs straight through', () => {
  const { milestones } = replayPlan(REPLAY_MILESTONES, T0 + 6 * HOUR_MS)
  const day = milestones[1].frame
  const step = playbackDelay(milestones, day + 1, 0, false)
  assert.equal(playbackDelay(milestones, day, 0, false), step)
  assert.equal(
    playbackDelay(milestones, day, 0, true),
    step + MILESTONE_HOLD_MS
  )
})

test('scrubber keys step frames and jump milestones', () => {
  const { times, milestones } = replayPlan(REPLAY_MILESTONES, T0 + HOUR_MS)
  const last = times.length - 1
  const day = milestones[1].frame
  // An arrow moves a whole frame, though a slider step is less than one.
  assert.equal(scrubKeyFrame(milestones, 0, last, 'ArrowRight'), 1)
  assert.equal(frameAtSlider(milestones, sliderValue(milestones, 0) + 1), 0)
  assert.equal(scrubKeyFrame(milestones, 0, last, 'ArrowLeft'), 0)
  assert.equal(scrubKeyFrame(milestones, last, last, 'ArrowUp'), last)
  assert.equal(scrubKeyFrame(milestones, 3, last, 'PageUp'), day)
  assert.equal(scrubKeyFrame(milestones, day, last, 'PageDown'), 0)
  assert.equal(scrubKeyFrame(milestones, day + 2, last, 'PageDown'), day)
  assert.equal(scrubKeyFrame(milestones, 5, last, 'End'), last)
  assert.equal(scrubKeyFrame(milestones, 5, last, 'Home'), 0)
  assert.equal(scrubKeyFrame(milestones, 5, last, 'Tab'), undefined)
})

test('the replay opens 3 hours out', () => {
  const { milestones } = replayPlan(REPLAY_MILESTONES, T0 + 6 * HOUR_MS)
  assert.equal(
    milestones.find((m) => m.frame === defaultFrame(milestones))?.id,
    '3h'
  )
  // A plan that hasn't reached 3 hours out opens at the start.
  const early = replayPlan(REPLAY_MILESTONES, T0 - 5 * HOUR_MS).milestones
  assert.equal(defaultFrame(early), 0)
})

test('chamber gaps read in whole points as shown', () => {
  // Manifold R 22.4% (D 78%) against real money R 26.5% (D 73%).
  assert.deepEqual(chamberGap(0.2241, 0.265), {
    points: 5,
    party: 'D',
    resolved: false,
  })
  assert.deepEqual(chamberGap(0.265, 0.2241), {
    points: -5,
    party: 'D',
    resolved: false,
  })
  // Once resolved, on the winner: positive is Manifold closer to it.
  assert.deepEqual(chamberGap(0.2241, 0.265, 'D'), {
    points: 5,
    party: 'D',
    resolved: true,
  })
  assert.deepEqual(chamberGap(0.2241, 0.265, 'R'), {
    points: -5,
    party: 'R',
    resolved: true,
  })
  // Reading the same, or both past the bounds, is no gap.
  assert.equal(chamberGap(0.2, 0.2049), undefined)
  assert.equal(chamberGap(0.0074, 0.0045), undefined)
  // Both ">99%" on the Democrats: even, though 0.5 apart past the bound.
  assert.equal(chamberGap(0.0058, 0.0005, 'D'), undefined)
  // "99%" against ">99%" is a real gap.
  assert.deepEqual(chamberGap(0.013, 0.0015, 'D'), {
    points: -1,
    party: 'D',
    resolved: true,
  })
})

test('party odds round so both sides add up as shown', () => {
  const show = (rep: number) => {
    const { dem, rep: r } = partySplit(rep)
    return `${formatOdds(dem)}/${formatOdds(r)}`
  }
  assert.equal(show(0.195), '80%/20%')
  assert.equal(show(0.805), '19%/81%')
  assert.equal(show(0.0064), '>99%/<1%')
  assert.equal(show(0.9936), '<1%/>99%')
  assert.equal(show(0.0004), '>99%/<1%')
  assert.equal(show(0.0096), '99%/1%')
  assert.equal(show(0.9906), '<1%/>99%')
  assert.equal(show(0.5), '50%/50%')
})

test('countdown reads days, hours and minutes either side of the polls', () => {
  assert.equal(replayCountdown(T0), 'Polls close')
  assert.equal(replayCountdown(T0 - 7 * DAY_MS), '7 days out')
  assert.equal(
    replayCountdown(T0 - (2 * DAY_MS + 6 * HOUR_MS)),
    '2 days 6 hours out'
  )
  assert.equal(replayCountdown(T0 - HOUR_MS), '1 hour out')
  assert.equal(replayCountdown(T0 - 45 * MINUTE_MS), '45 min out')
  assert.equal(
    replayCountdown(T0 + 3 * HOUR_MS + 15 * MINUTE_MS),
    '3 hours 15 min after polls closed'
  )
})

test('Latest is the markets as the page read them, after the snapshot', () => {
  // A snapshot that stopped mid-plan, on its own Latest.
  const { times, milestones } = replayPlan(
    REPLAY_MILESTONES,
    T0 + 2 * HOUR_MS + 7 * MINUTE_MS
  )
  const snapshot = {
    generatedAt: 0,
    times,
    milestones,
    markets: {
      senate: { prob: [[0, 0.3] as [number, number]] },
      race: {
        answerProbs: {
          a: [[0, 0.6] as [number, number]],
          b: [[0, 0.4] as [number, number]],
        },
      },
      quiet: { prob: [[0, 0.5] as [number, number]] },
    },
  }
  const now = T0 + 20 * HOUR_MS
  const latest = withLatestFrame(
    snapshot,
    {
      senate: { prob: 0.0123456 },
      race: { answerProbs: { a: 0.97, b: 0.4 } },
      // Not in the page's markets: left as the snapshot had it.
    },
    now
  )
  const frame = times.length
  assert.equal(latest.times.length, times.length + 1)
  assert.equal(latest.times[frame], now)
  // One Latest, at the new frame; the snapshot's own became a plain frame.
  const ids = latest.milestones.map((m) => m.id)
  assert.equal(ids.filter((id) => id === LATEST_MILESTONE_ID).length, 1)
  assert.deepEqual(latest.milestones[latest.milestones.length - 1], {
    id: LATEST_MILESTONE_ID,
    label: 'Latest',
    note: 'The odds now',
    time: now,
    frame,
  })
  assert.equal(marketProbsAtFrame(latest.markets.senate, frame).prob, 0.0123)
  assert.deepEqual(marketProbsAtFrame(latest.markets.race, frame).answerProbs, {
    a: 0.97,
    b: 0.4,
  })
  // An unchanged answer gets no new point.
  assert.equal(latest.markets.race.answerProbs?.b.length, 1)
  assert.equal(marketProbsAtFrame(latest.markets.quiet, frame).prob, 0.5)
  // The frames before are untouched.
  assert.equal(marketProbsAtFrame(latest.markets.senate, frame - 1).prob, 0.3)
})

test('Latest no older than the snapshot leaves it as it is', () => {
  const { times, milestones } = replayPlan(REPLAY_MILESTONES, T0)
  const snapshot = { generatedAt: 0, times, milestones, markets: {} }
  assert.equal(withLatestFrame(snapshot, {}, T0), snapshot)
  assert.equal(withLatestFrame(snapshot, {}, T0 - HOUR_MS), snapshot)
  assert.equal(withLatestFrame(snapshot, {}, NaN), snapshot)
})

test('a market reads its traded odds from its pools, even resolved', () => {
  const binary = {
    mechanism: 'cpmm-1',
    pool: { YES: 300, NO: 100 },
    p: 0.5,
    prob: 0,
    isResolved: true,
    resolution: 'NO',
  } as unknown as Contract
  assert.equal(contractProbs(binary)?.prob, 0.25)
  const multi = {
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    answers: [
      { id: 'a', poolYes: 100, poolNo: 300, prob: 1 },
      { id: 'b', poolYes: 300, poolNo: 100, prob: 0 },
    ],
  } as unknown as Contract
  assert.deepEqual(contractProbs(multi)?.answerProbs, { a: 0.75, b: 0.25 })
})

test('every milestone has a short button label, and Latest reads Latest', () => {
  for (const spec of REPLAY_MILESTONES) {
    assert.ok(spec.short.length > 0 && spec.short.length <= spec.label.length)
    assert.equal(milestoneShortLabel(spec), spec.short)
  }
  assert.equal(
    milestoneShortLabel({ id: LATEST_MILESTONE_ID, label: 'Latest: x' }),
    'Latest'
  )
  // A milestone the plan no longer has keeps its own label.
  assert.equal(milestoneShortLabel({ id: 'gone', label: 'Gone' }), 'Gone')
})
