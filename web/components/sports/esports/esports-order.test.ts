import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EsportsSeriesFacts, EsportsTournamentView } from 'common/esports/types'
import { HOUR_MS } from 'common/util/time'
import { isStaleLive, orderTournaments } from './esports-order'

const now = Date.UTC(2026, 10, 26, 4)
let nextId = 1

const series = (
  status: EsportsSeriesFacts['status'],
  startsInHours: number | null
): EsportsSeriesFacts => ({
  game: 'cs',
  id: nextId++,
  tournament: { id: 1, name: 'Event', tier: null },
  stage: null,
  round: null,
  position: null,
  bestOf: 3,
  startTimeMs: startsInHours === null ? null : now + startsInHours * HOUR_MS,
  status,
  team1: { id: 1, name: 'One', code: null },
  team2: { id: 2, name: 'Two', code: null },
  score: null,
  winnerId: null,
  review: null,
})

/** A one-stage tournament with the status the engine would give its series. */
const event = (
  id: number,
  tier: string | null,
  list: EsportsSeriesFacts[]
): EsportsTournamentView => {
  const state = list.every((s) => s.status === 'final')
    ? 'done'
    : list.every((s) => s.status === 'scheduled')
    ? 'next'
    : 'current'
  return {
    game: 'cs',
    tournament: { id, name: `Event ${id}`, tier },
    stages: [
      {
        signal: {
          game: 'cs',
          tournamentId: id,
          stageId: null,
          stageName: null,
          stageType: null,
          stageOrder: null,
          format: null,
          promotionCount: null,
          roundLabels: [],
        },
        classification: { template: 'list', reason: '', unknownLabels: [] },
        state,
        view: { kind: 'list', days: [{ date: 'tbd', series: list }] },
      },
    ],
    champion: null,
    status:
      state === 'done'
        ? 'finished'
        : state === 'next'
        ? 'upcoming'
        : 'in-progress',
  }
}

const ids = (views: EsportsTournamentView[]) =>
  orderTournaments(views, now).map((v) => v.tournament.id)

test('the reviewed page: a C-tier event with a series stuck live since last week no longer leads the Major', () => {
  const fiesta = event(1, 'c', [
    series('final', -170),
    series('in_progress', -154),
    series('scheduled', 5),
  ])
  const major = event(2, 's', [series('final', -24), series('scheduled', 2)])
  assert.deepEqual(ids([fiesta, major]), [2, 1])
})

test('tier comes first: s, a, b, c, d, then no tier', () => {
  const views = [null, 'd', 'c', 'b', 'a', 's'].map((tier, i) =>
    event(i + 1, tier, [series('in_progress', -1)])
  )
  assert.deepEqual(ids(views), [6, 5, 4, 3, 2, 1])
})

test('a higher tier yet to start leads a lower tier in play', () => {
  const live = event(1, 'c', [series('in_progress', -1)])
  const later = event(2, 'a', [series('scheduled', 72)])
  assert.deepEqual(ids([live, later]), [2, 1])
})

test('a tier in capitals reads the same, and an unlisted tier goes last with no tier', () => {
  const upper = event(1, 'S', [series('scheduled', 9)])
  const lower = event(2, 's', [series('scheduled', 8)])
  const unknown = event(3, 'qualifier', [series('scheduled', 1)])
  const none = event(4, null, [series('scheduled', 2)])
  const d = event(5, 'd', [series('scheduled', 50)])
  assert.deepEqual(ids([none, unknown, upper, lower, d]), [2, 1, 5, 3, 4])
})

test('within a tier, in play comes before yet to start', () => {
  const upcoming = event(1, 'b', [series('scheduled', 1)])
  const between = event(2, 'b', [series('final', -30), series('scheduled', 40)])
  const live = event(3, 'b', [
    series('in_progress', -2),
    series('scheduled', 3),
  ])
  assert.deepEqual(ids([upcoming, between, live]), [3, 2, 1])
})

test('within a tier and phase, the soonest next series leads; no start time goes last', () => {
  const noTime = event(1, 'c', [series('scheduled', null)])
  const far = event(2, 'c', [series('scheduled', 30)])
  const near = event(3, 'c', [series('scheduled', 3), series('scheduled', 90)])
  assert.deepEqual(ids([noTime, far, near]), [3, 2, 1])
})

test('a finished series is not the next series', () => {
  const played = event(1, 'c', [series('final', -5), series('scheduled', 20)])
  const sooner = event(2, 'c', [series('final', -3), series('scheduled', 10)])
  assert.deepEqual(ids([played, sooner]), [2, 1])
})

test('live for more than 12 hours is stale: not the next series', () => {
  const stale = (hours: number) =>
    event(1, 'c', [
      series('final', -40),
      series('in_progress', -hours),
      series('scheduled', 6),
    ])
  const fresh = event(2, 'c', [series('final', -20), series('scheduled', 1)])
  // Still within 12 hours, the live series is its tournament's next: it leads.
  assert.deepEqual(ids([fresh, stale(11)]), [1, 2])
  // Past 12 hours it is left out, and the next real series is 6 hours away.
  assert.deepEqual(ids([fresh, stale(13)]), [2, 1])
})

test('a stale live series does not put a tournament in play', () => {
  // Nothing has finished and the only "live" series is stale: yet to start.
  const stuck = event(1, 'c', [
    series('in_progress', -100),
    series('scheduled', 2),
  ])
  const underway = event(2, 'c', [series('final', -3), series('scheduled', 50)])
  assert.deepEqual(ids([stuck, underway]), [2, 1])
})

test('nothing left but a stale live series goes after those yet to start', () => {
  const stalled = event(1, 'c', [
    series('final', -200),
    series('in_progress', -150),
  ])
  const upcoming = event(2, 'c', [series('scheduled', 300)])
  const finished = event(3, 'c', [series('final', -10)])
  assert.deepEqual(ids([finished, stalled, upcoming]), [2, 1, 3])
})

test('finished tournaments come last whatever their tier, by tier and then the latest', () => {
  const upcomingD = event(1, 'd', [series('scheduled', 500)])
  const doneS = event(2, 's', [series('final', -200)])
  const doneCOld = event(3, 'c', [series('final', -90)])
  const doneCNew = event(4, 'c', [series('final', -20)])
  assert.deepEqual(ids([doneCOld, doneS, doneCNew, upcomingD]), [1, 2, 4, 3])
})

test('ties fall back to the tournament id, and the input is left as it was', () => {
  const views = [3, 1, 2].map((id) => event(id, 'c', [series('scheduled', 4)]))
  assert.deepEqual(ids(views), [1, 2, 3])
  assert.deepEqual(
    views.map((v) => v.tournament.id),
    [3, 1, 2]
  )
})

test('isStaleLive: only a live series, only past 12 hours, only with a start', () => {
  assert.equal(isStaleLive(series('in_progress', -12.01), now), true)
  assert.equal(isStaleLive(series('in_progress', -12), now), false)
  assert.equal(isStaleLive(series('in_progress', null), now), false)
  assert.equal(isStaleLive(series('scheduled', -48), now), false)
  assert.equal(isStaleLive(series('final', -48), now), false)
})
