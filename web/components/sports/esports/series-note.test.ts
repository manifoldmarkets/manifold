import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { EsportsReview } from 'common/bdl/esports-series'
import { EsportsSeriesFacts, EsportsTeamRef } from 'common/esports/types'
import { seriesNote } from './series-note'

const one: EsportsTeamRef = { id: 1, name: 'One', code: null }
const two: EsportsTeamRef = { id: 2, name: 'Two', code: null }
const note = (
  status: EsportsSeriesFacts['status'],
  review: string | null,
  team1: EsportsTeamRef | null = one,
  team2: EsportsTeamRef | null = two
) => seriesNote({ status, review, team1, team2 })

// Every reason the reader can hold a series for. A new one fails to compile
// here and in series-note.ts until it has copy.
const REVIEWS: Record<EsportsReview, true> = {
  entrants: true,
  format: true,
  forfeit: true,
  status: true,
  score: true,
  winner: true,
  start: true,
}
const reviews = Object.keys(REVIEWS)

test('nothing held, nothing said', () => {
  assert.equal(note('scheduled', null), null)
  assert.equal(note('in_progress', null), null)
  assert.equal(note('final', null), null)
})

test('a scheduled series missing a team reads "Teams TBD", never "under review"', () => {
  assert.equal(note('scheduled', 'entrants', null, null), 'Teams TBD')
  assert.equal(note('scheduled', 'entrants', one, null), 'Teams TBD')
  assert.equal(note('scheduled', 'entrants', null, two), 'Teams TBD')
  // Whatever else the reader held it for, the missing team is what shows.
  assert.equal(note('scheduled', 'format', one, null), 'Teams TBD')
  assert.equal(note('scheduled', null, one, null), 'Teams TBD')
})

test('no series still to finish says a result is under review', () => {
  for (const status of ['scheduled', 'in_progress'] as const)
    for (const review of [...reviews, 'something-new'])
      assert.doesNotMatch(note(status, review) ?? '', /result/i)
})

test('a series still to finish: what each hold reads', () => {
  for (const status of ['scheduled', 'in_progress'] as const) {
    assert.equal(note(status, 'forfeit'), 'Forfeit: settled by a person')
    // Both teams are named, so the reader held it for naming one team twice.
    assert.equal(note(status, 'entrants'), 'Teams unconfirmed')
    assert.equal(note(status, 'status'), 'Status unclear: under review')
    assert.equal(note(status, 'score'), "Score doesn't add up: under review")
    // The row already shows these: no "Bo", and "Time to be announced".
    assert.equal(note(status, 'format'), null)
    assert.equal(note(status, 'start'), null)
  }
  assert.equal(note('in_progress', 'entrants', one, null), 'Teams unconfirmed')
})

test('a finished series: every hold says why its result is not counted', () => {
  assert.equal(note('final', 'forfeit'), 'Forfeit: settled by a person')
  assert.equal(
    note('final', 'entrants'),
    'Teams unconfirmed: result under review'
  )
  assert.equal(
    note('final', 'format'),
    'Series length unknown: result under review'
  )
  assert.equal(note('final', 'status'), 'Result not confirmed: under review')
  assert.equal(note('final', 'score'), "Score doesn't add up: under review")
  assert.equal(
    note('final', 'winner'),
    "Winner doesn't match the score: under review"
  )
  for (const review of reviews) assert.ok(note('final', review), review)
})

test('a forfeit is a forfeit even with a team missing', () => {
  assert.equal(
    note('scheduled', 'forfeit', one, null),
    'Forfeit: settled by a person'
  )
})

test('a review word this page does not know still gets a plain note', () => {
  assert.equal(note('final', 'something-new'), 'Result under review')
  assert.equal(note('in_progress', 'something-new'), 'Under review')
  // Not a hold, though every object has it.
  assert.equal(note('final', 'toString'), 'Result under review')
})
