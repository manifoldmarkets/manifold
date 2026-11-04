import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { formatOdds } from 'web/components/usa-map/election-display'
import { POLLS_CLOSE_2026 } from 'web/components/usa-map/election-rewind-model'
import {
  frameAtSlider,
  LATEST_MILESTONE_ID,
  MILESTONE_HOLD_MS,
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

test('party odds round so both sides add up as shown', () => {
  const show = (rep: number) => {
    const { dem, rep: r } = partySplit(rep)
    return `${formatOdds(dem)}/${formatOdds(r)}`
  }
  assert.equal(show(0.195), '80%/20%')
  assert.equal(show(0.805), '19%/81%')
  assert.equal(show(0.0064), '99.4%/0.6%')
  assert.equal(show(0.9936), '0.6%/99.4%')
  assert.equal(show(0.0004), '>99.9%/<0.1%')
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
    '3 hours 15 min after the first polls closed'
  )
})
