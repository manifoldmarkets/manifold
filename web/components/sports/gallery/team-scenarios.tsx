import { useRouter } from 'next/router'
import { useState } from 'react'
import type { ScheduleGame, ScheduleTeam } from 'common/sports-schedule'
import { TeamScoreboard } from '../team-scoreboard'

// Fictional exhibition leagues. Only this admin/dev gallery imports these games.
const leagues = {
  nba: [
    'Lantern Coast Basketball League',
    'Quarry Bay Owls',
    'Glasshaven Foxes',
  ],
  wnba: [
    'Moonrise Basketball League',
    'Brightwater Pilots',
    'Northglass Comets',
  ],
  nhl: [
    'Frost Channel Hockey League',
    'Copper Sound Puffins',
    'Glacier Port Narwhals',
  ],
  mlb: ['Meridian Diamond League', 'Saltmill Herons', 'Bracken Cove Terns'],
  nfl: [
    'High Mesa Football League',
    'Windspire Rooks',
    'Alder Basin Jackrabbits',
  ],
  soccer: ['Lantern Sea Cup', 'Manaland FC', 'Rainborough Athletic'],
} as const

type Sport = keyof typeof leagues
type Scenario = {
  label: string
  game: ScheduleGame
  move?: boolean
  attention?: boolean
}
type Detail = NonNullable<ScheduleGame['scoreboard']>

const kickoff = Date.UTC(2027, 6, 3, 20)
const day = 24 * 60 * 60 * 1000

function team(name: string, id: string, prob: number): ScheduleTeam {
  return {
    name,
    shortName: name.split(' ').slice(-1)[0],
    answerId: id,
    prob,
    flag: '',
    color: null,
    imageUrl: null,
  }
}

function liveFields(
  sport: Sport
): Pick<ScheduleGame, 'period' | 'clock' | 'scoreboard' | 'liveScore'> {
  function feed(
    home: number,
    away: number,
    period: number,
    scoreboard: Detail,
    clock?: string
  ) {
    return {
      period,
      clock,
      scoreboard,
      liveScore: {
        home,
        away,
        status: 'IN_PLAY',
        minute: sport === 'soccer' ? "67'" : null,
      },
    }
  }
  switch (sport) {
    case 'nba':
    case 'wnba':
      return feed(
        51,
        48,
        3,
        {
          periodScores: [
            { home: 20, away: 17 },
            { home: 18, away: 22 },
            { home: 13, away: 9 },
          ],
        },
        '4:12'
      )
    case 'nhl':
      return feed(1, 2, 2, { shots: { home: 16, away: 21 } }, '8:14')
    case 'mlb':
      return feed(2, 3, 7, {
        inningHalf: 'top',
        bases: [true, false, true],
        outs: 1,
      })
    case 'nfl':
      return feed(14, 10, 3, { down: 3, yardsToGo: 4 }, '6:24')
    case 'soccer':
      return feed(1, 0, 2, { redCards: { home: 0, away: 1 } })
  }
}

function scenarios(sport: Sport): Scenario[] {
  const [league, homeName, awayName] = leagues[sport]
  const soccer = sport === 'soccer'
  const home = team(homeName, 'home', soccer ? 0.48 : 0.54)
  const away = team(awayName, 'away', soccer ? 0.3 : 0.46)
  const sample: ScheduleGame = {
    id: 'gallery',
    sportsEventId: 'gallery',
    slug: 'gallery',
    creatorUsername: 'gallery',
    question: `${awayName} at ${homeName}`,
    league,
    sport,
    sportsLeagueKey: soccer ? 'epl' : sport,
    home,
    away,
    draw: soccer ? { answerId: 'draw', prob: 0.22 } : null,
    volume: 0,
    uniqueBettorCount: 0,
    startTime: kickoff,
    closeTime: kickoff,
    kickoffKnown: true,
    status: 'upcoming',
    gameState: 'scheduled',
    finalScore: null,
    liveScore: null,
    winnerAnswerId: null,
    isResolved: false,
    resolutionTime: null,
    related: [],
    relatedCount: 0,
  }
  const match = (
    label: string,
    patch: Partial<ScheduleGame>,
    options: Pick<Scenario, 'attention' | 'move'> = {}
  ): Scenario => {
    const id = `gallery-${sport}-${label.toLowerCase().replace(/\W+/g, '-')}`
    return {
      label,
      game: { ...sample, ...patch, id, sportsEventId: id },
      ...options,
    }
  }
  const live = liveFields(sport)
  const [h, a] =
    sport === 'nfl'
      ? [24, 21]
      : sport === 'nba' || sport === 'wnba'
      ? [91, 86]
      : [3, 2]
  const score = { home: h, away: a }
  const terminal: Partial<ScheduleGame> = {
    status: 'finished',
    gameState: 'final',
    isResolved: true,
    finalScore: score,
    winnerAnswerId: home.answerId,
    resolutionTime: kickoff + day,
  }
  const results = [
    match(
      'Scheduled',
      sport === 'nba'
        ? {
            scoreboard: {
              standings: {
                home: { wins: 9, losses: 0, rank: 1 },
                away: { wins: 6, losses: 3, rank: 4 },
              },
            },
          }
        : {}
    ),
    match('Kickoff unknown', { kickoffKnown: false }),
    match('Pre-game price move', {}, { move: true }),
    match('Live', { ...live, status: 'live', gameState: 'live' }),
    ...(sport === 'nba' || sport === 'wnba'
      ? [
          match('Fourth quarter', {
            ...live,
            period: 4,
            clock: '7:31',
            status: 'live',
            gameState: 'live',
            liveScore: {
              home: 58,
              away: 56,
              status: 'IN_PROGRESS',
              minute: null,
            },
            scoreboard: {
              periodScores: [
                { home: 20, away: 17 },
                { home: 18, away: 22 },
                { home: 13, away: 9 },
                { home: 7, away: 8 },
              ],
            },
          }),
        ]
      : []),
    match('Delayed', { gameState: 'delayed' }),
    match('Final, settling', {
      status: 'finished',
      gameState: 'settling',
      finalScore: score,
    }),
    match('Final, home win', terminal),
    match('Final, away win', {
      ...terminal,
      finalScore: { home: a, away: h },
      winnerAnswerId: away.answerId,
    }),
  ]
  if (sport === 'nfl' || soccer)
    results.push(
      match('Final, draw', {
        ...terminal,
        finalScore: { home: a, away: a },
        winnerAnswerId: sample.draw?.answerId ?? null,
      })
    )
  if (sport !== 'mlb')
    results.push(
      match(soccer ? 'After extra time' : 'Overtime', {
        ...terminal,
        finalQualifier: soccer ? 'AET' : 'OT',
      })
    )
  if (sport === 'nhl')
    results.push(match('Shootout', { ...terminal, finalQualifier: 'SO' }))
  return [
    ...results,
    match('Postponed', { gameState: 'postponed', closeTime: kickoff + day }),
    match('Suspended', {
      ...live,
      gameState: 'suspended',
      status: 'live',
      resumptionTime: kickoff + 2 * day,
    }),
    match('Canceled, awaiting resolution', {
      status: 'finished',
      gameState: 'canceled',
    }),
    match('Canceled', {
      isCanceled: true,
      status: 'finished',
      gameState: 'canceled',
      isResolved: true,
      resolutionTime: kickoff,
    }),
    match(
      'Needs attention',
      { status: 'finished', gameState: 'settling', finalScore: score },
      { attention: true }
    ),
  ]
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const [moved, setMoved] = useState(false)
  const [preview, setPreview] = useState<string>()
  let { game } = scenario
  if (moved && scenario.move)
    game = {
      ...game,
      home: { ...game.home, prob: game.home.prob + 0.06 },
      away: { ...game.away, prob: game.away.prob - 0.06 },
    }
  return (
    <article className="min-w-0">
      <div className="mb-1 flex min-h-[40px] flex-wrap items-center justify-between gap-x-3">
        <h3 className="text-ink-700 text-sm font-semibold">{scenario.label}</h3>
        {scenario.move && (
          <button
            type="button"
            className="text-primary-700 min-h-[40px] px-2 text-sm font-semibold underline"
            onClick={() => setMoved(!moved)}
          >
            {moved ? 'Reset prices' : 'Move prices'}
          </button>
        )}
      </div>
      <TeamScoreboard
        game={game}
        onBet={game.gameState === 'live' && !game.draw ? setPreview : undefined}
      />
      {preview && (
        <p role="status" className="text-ink-600 mt-1 text-sm">
          Preview selection ·{' '}
          {preview === game.home.answerId ? game.home.name : game.away.name}
        </p>
      )}
      {scenario.attention && (
        <p className="text-ink-600 mt-1 text-sm">
          Admin review · Conflicting final scores
        </p>
      )}
    </article>
  )
}

export default function TeamScenarios({ sport }: { sport: string }) {
  const router = useRouter()
  const key = Object.prototype.hasOwnProperty.call(leagues, sport)
    ? (sport as Sport)
    : undefined
  return (
    <div className="@container min-w-0">
      <label className="text-ink-700 flex flex-wrap items-center gap-2 text-sm font-semibold">
        Sport
        <select
          value={key ?? ''}
          onChange={(event) =>
            void router.push('/admin/sports-gallery/' + event.target.value)
          }
          className="bg-canvas-0 border-ink-300 min-h-[40px] rounded-md border px-3"
        >
          {!key && (
            <option value="" disabled>
              Choose a sport
            </option>
          )}
          {Object.keys(leagues).map((id) => (
            <option key={id} value={id}>
              {id === 'soccer' ? 'Soccer' : id.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      {key ? (
        <>
          <h2 className="text-ink-900 mt-5 text-xl font-semibold">
            {leagues[key][0]}
          </h2>
          <p className="text-ink-600 mb-2 text-sm">
            Fictional games and market prices.
          </p>
          <div className="@[42rem]:grid-cols-2 grid gap-x-4 gap-y-3">
            {scenarios(key).map((scenario) => (
              <ScenarioCard key={scenario.game.id} scenario={scenario} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-ink-700 mt-4">No team scenarios for this sport.</p>
      )}
    </div>
  )
}
