import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ScheduleGame } from 'common/sports-schedule'
import { TeamScoreboard } from './team-scoreboard'

const team = {
  name: 'Alder Owls',
  shortName: 'Owls',
  answerId: 'owls',
  prob: 0.55,
  color: null,
  imageUrl: null,
  flag: '',
}
const game: ScheduleGame = {
  id: 'market',
  slug: 'match',
  creatorUsername: 'Sports',
  question: 'Who wins?',
  sport: 'nba',
  league: 'Coast League',
  sportsEventId: 'fake',
  status: 'upcoming',
  gameState: 'scheduled',
  home: team,
  away: {
    ...team,
    name: 'Cove Terns',
    shortName: 'Terns',
    answerId: 'terns',
    prob: 0.45,
  },
  draw: null,
  isResolved: false,
  winnerAnswerId: null,
  resolutionTime: null,
  kickoffKnown: true,
  startTime: 10000,
  closeTime: 10000,
  volume: 0,
  uniqueBettorCount: 0,
  liveScore: null,
  finalScore: null,
  related: [],
  relatedCount: 0,
}
const render = (patch: Partial<ScheduleGame>) =>
  renderToStaticMarkup(<TeamScoreboard game={{ ...game, ...patch }} />)

test('finals never promote an in-play snapshot to a final score', () => {
  const liveScore = { home: 41, away: 32, minute: null, status: 'IN_PLAY' }
  const settled = { gameState: 'final', isResolved: true, liveScore } as const
  assert.doesNotMatch(render(settled), />41<|>32<|Winner/)
  assert.match(
    render({ ...settled, liveScore: { ...liveScore, status: 'FINAL' } }),
    />41</
  )
  assert.match(
    render({ ...settled, finalScore: { home: 82, away: 79 } }),
    />82</
  )
  const awaiting = render({
    gameState: undefined,
    status: 'finished',
    liveScore,
  })
  assert.match(awaiting, /Awaiting result/)
  assert.doesNotMatch(awaiting, />41<|>32<|55%/)
})

test('standings show only supplied entrant records and preserve zero', () => {
  assert.doesNotMatch(render({ scoreboard: {} }), /Standings/)
  const html = render({
    scoreboard: { standings: { home: { wins: 0, losses: 2, rank: 4 } } },
  })
  const standings = html.slice(html.indexOf('Standings'))
  assert.match(standings, /Alder Owls/)
  assert.doesNotMatch(standings, /Cove Terns|Ties/)
  assert.match(standings, />0<\/td>/)
  assert.match(standings, />4<\/td>/)
})

test('ranked standings place the higher-ranked team first', () => {
  const html = render({
    scoreboard: {
      standings: {
        home: { rank: 1, wins: 3, losses: 0 },
        away: { rank: 4, wins: 1, losses: 2 },
      },
    },
  })
  const standings = html.slice(html.indexOf('Standings'))
  assert.ok(standings.indexOf('Alder Owls') < standings.indexOf('Cove Terns'))
})

test('a provider cancellation does not imply an N/A payout or a winner', () => {
  const canceled = {
    sport: 'nfl',
    gameState: 'canceled',
    finalScore: { home: 0, away: 0 },
    winnerAnswerId: game.home.answerId,
  } as const
  const pending = render(canceled)
  assert.match(pending, />Canceled</)
  assert.doesNotMatch(pending, /N\/A|Tie|Winner|Chance|>0<\/td>/)
  const voided = {
    ...canceled,
    gameState: 'final',
    isResolved: true,
    isCanceled: true,
  } as const
  assert.match(render(voided), /Canceled · N\/A/)
  assert.doesNotMatch(render(voided), /Winner|Chance|>0<\/td>/)
  assert.doesNotMatch(render({ ...voided, winnerAnswerId: null }), /Tie/)
})

test('suspended and settling scores disclose freshness even with no provider timestamp', () => {
  const liveScore = { home: 0, away: null, status: 'SUSPENDED', minute: null }
  assert.match(
    render({ gameState: 'suspended', liveScore }),
    /Scores are delayed/
  )
  assert.match(
    render({ gameState: 'settling', finalScore: { home: 0, away: 1 } }),
    /Scores are delayed/
  )
  assert.doesNotMatch(render({ gameState: 'settling' }), /Scores are delayed/)
})

test('live prices are named bet buttons next to each team score', () => {
  const live: ScheduleGame = {
    ...game,
    gameState: 'live',
    status: 'live',
    liveScore: { home: 31, away: 0, status: 'IN_PROGRESS', minute: null },
  }
  const html = renderToStaticMarkup(
    <TeamScoreboard game={live} onBet={() => {}} />
  )
  assert.match(
    html,
    /Cove Terns[\s\S]*?>0<\/td>[\s\S]*?Bet on Cove Terns at 45%/
  )
  assert.match(
    html,
    /Alder Owls[\s\S]*?>31<\/td>[\s\S]*?Bet on Alder Owls at 55%/
  )
  const missing = renderToStaticMarkup(
    <TeamScoreboard
      game={{ ...live, away: { ...live.away, prob: Number.NaN } }}
      onBet={() => {}}
    />
  )
  assert.doesNotMatch(missing, /Bet on Cove Terns/)
})

test('standings distinguish zero overtime losses from a missing field', () => {
  const record = { wins: 4, losses: 3, overtimeLosses: 0 }
  const html = render({
    sport: 'nhl',
    scoreboard: { standings: { home: record, away: { wins: 3, losses: 1 } } },
  })
  assert.match(html, /Overtime losses/)
  assert.match(
    html.slice(html.indexOf('Standings')),
    /Cove Terns[\s\S]*?—[\s\S]*?Alder Owls[\s\S]*?>0<\/td>/
  )
})

test('the quarter history shares each team row with its score and preserves missing periods', () => {
  const periods = [
    { home: 21, away: 18 },
    { home: 0, away: null },
    { home: 10, away: 5 },
  ]
  const markup = render({
    gameState: 'live',
    status: 'live',
    liveScore: { home: 31, away: 23, status: 'IN_PROGRESS', minute: null },
    scoreboard: { periodScores: periods },
  })
  const header = markup.slice(0, markup.indexOf('</thead>'))
  assert.match(header, />Q1<[\s\S]*?>Q2<[\s\S]*?>Q3<[\s\S]*?>Score</)
  const rows = markup.split('</tr>')
  assert.match(
    rows[1],
    /Cove Terns[\s\S]*?>18<[\s\S]*?>—<[\s\S]*?>5<[\s\S]*?>23</
  )
  assert.match(
    rows[2],
    /Alder Owls[\s\S]*?>21<[\s\S]*?>0<[\s\S]*?>10<[\s\S]*?>31</
  )
  assert.doesNotMatch(markup, /Q1 ·/)
})
test('live detail without totals discloses freshness; resolution cannot relabel partial periods or shots as final', () => {
  const partial = {
    periodScores: [{ home: 0, away: 3 }],
    shots: { home: 14, away: 17 },
  }
  const live = render({
    gameState: 'live',
    status: 'live',
    clock: '4:12',
    scoreboard: partial,
  })
  assert.match(live, /Q1/)
  assert.match(live, /Scores are delayed/)
  assert.match(
    render({ gameState: 'live', status: 'live', clock: '4:12' }),
    /Scores are delayed/
  )
  const resolved = render({
    gameState: 'final',
    isResolved: true,
    status: 'finished',
    scoreboard: partial,
    liveScore: { status: 'IN_PROGRESS', home: 0, away: 3, minute: null },
  })
  assert.doesNotMatch(resolved, />Q1<|Shots|>3<\/td>/)
  assert.match(
    render({
      gameState: 'final',
      isResolved: true,
      status: 'finished',
      scoreboard: partial,
      finalScore: { home: 61, away: 55 },
    }),
    />Q1</
  )
})

test('the initial scheduled and resumption dates use UTC independently of the rendering host timezone', () => {
  const at = Date.UTC(2026, 6, 3, 22, 30)
  assert.match(render({ startTime: at }), /Jul 3[\s\S]*10:30 PM UTC/)
  assert.match(
    render({ gameState: 'suspended', resumptionTime: at }),
    /resumes Jul 3[\s,]*UTC/
  )
})
