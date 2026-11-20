import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ScheduleGame, ScheduleTeam } from 'common/sports-schedule'
import {
  compareGameStartTime,
  compareGameVolume,
  getGameDisplayTeams,
  selectFeaturedGame,
} from './game-feed-utils'

const home: ScheduleTeam = {
  answerId: 'home-answer',
  name: 'Home',
  shortName: 'HOM',
  flag: '',
  imageUrl: null,
  color: null,
  prob: 0.6,
}
const away: ScheduleTeam = {
  ...home,
  answerId: 'away-answer',
  name: 'Away',
  shortName: 'AWY',
  prob: 0.4,
}

test('versus ordering keeps scores, probabilities and bet targets with each team', () => {
  const scores = { home: 21, away: 17 }
  const teams = getGameDisplayTeams({ home, away, draw: null })
  assert.deepEqual(
    teams.map(({ team, side, outcome }) => ({
      answerId: team.answerId,
      probability: team.prob,
      score: scores[side],
      outcome,
    })),
    [
      {
        answerId: 'away-answer',
        probability: 0.4,
        score: 17,
        outcome: 'teamB',
      },
      {
        answerId: 'home-answer',
        probability: 0.6,
        score: 21,
        outcome: 'teamA',
      },
    ]
  )
})

test('soccer keeps the home team first and leaves the draw separate', () => {
  const teams = getGameDisplayTeams({
    home,
    away,
    draw: { answerId: 'draw-answer', prob: 0.2 },
  })
  assert.deepEqual(
    teams.map(({ team, outcome }) => [team.answerId, outcome]),
    [
      ['home-answer', 'teamA'],
      ['away-answer', 'teamB'],
    ]
  )
})

type FeedGame = Pick<ScheduleGame, 'id' | 'status' | 'startTime' | 'volume'>

test('featured selection prefers live games and does not reorder its input', () => {
  const games: FeedGame[] = [
    { id: 'finished', status: 'finished', startTime: 1, volume: 10000 },
    { id: 'upcoming', status: 'upcoming', startTime: 4, volume: 1000 },
    { id: 'live-low', status: 'live', startTime: 2, volume: 10 },
    { id: 'live-high', status: 'live', startTime: 3, volume: 20 },
  ]
  const originalOrder = games.map((game) => game.id)
  assert.equal(selectFeaturedGame(games)?.id, 'live-high')
  assert.deepEqual(
    games.map((game) => game.id),
    originalOrder
  )
  assert.equal(selectFeaturedGame([games[0]]), undefined)
  assert.equal(selectFeaturedGame([]), undefined)
})

test('volume sorting handles invalid numbers and breaks ties by start time', () => {
  const game = (id: string, volume: number, startTime: number): FeedGame => ({
    id,
    volume,
    startTime,
    status: 'upcoming',
  })
  const games = [
    game('invalid', NaN, 5),
    game('later', 100, 3),
    game('first', 100, 2),
    game('negative', -1, 4),
    game('infinite', Infinity, 6),
  ]
  assert.deepEqual(
    games.sort(compareGameVolume).map((g) => g.id),
    ['first', 'later', 'negative', 'invalid', 'infinite']
  )
  assert.deepEqual(
    [game('high-volume', 1000, 2), game('earlier', 1, 1)]
      .sort(compareGameStartTime)
      .map((g) => g.id),
    ['earlier', 'high-volume']
  )
})

test('featured game stays put across pagination and volume changes, but yields to live games', () => {
  const first: FeedGame = {
    id: 'first',
    status: 'upcoming',
    startTime: 1,
    volume: 10,
  }
  const later: FeedGame = {
    id: 'later',
    status: 'upcoming',
    startTime: 2,
    volume: 100,
  }
  assert.equal(selectFeaturedGame([first, later], first.id)?.id, first.id)
  const live = { ...later, status: 'live' as const }
  assert.equal(selectFeaturedGame([first, live], first.id)?.id, live.id)
  const biggerLive = { ...first, status: 'live' as const, volume: 1000 }
  assert.equal(selectFeaturedGame([biggerLive, live], live.id)?.id, live.id)
  assert.equal(
    selectFeaturedGame([{ ...live, status: 'finished' }, first], live.id)?.id,
    first.id
  )
  assert.equal(selectFeaturedGame([later], first.id)?.id, later.id)
})
