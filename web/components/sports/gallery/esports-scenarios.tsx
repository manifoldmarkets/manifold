import { useState } from 'react'
import {
  readEsportsSeries,
  type EsportsLeague,
  type EsportsSeries,
} from 'common/bdl/esports-series'
import { readValorantPlacementPage } from 'common/bdl/esports-series-details'
import {
  type EsportsSeriesView,
  type EsportsMarket,
} from 'common/bdl/esports-market'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { EsportsTournament } from '../esports-tournament'

const choices = [
  'CS2 live',
  'Dota 2 live',
  'LoL rematches',
  'Valorant placements',
  'Unlinked series',
  'Series under review',
] as const
type Scenario = (typeof choices)[number]
const worlds = { id: 342, name: 'Worlds 2026' }
const predator = { id: 1256402, name: 'Predator League Thailand 2027' }
const geng = { id: 2, name: 'Gen.G Esports' },
  ig = { id: 23, name: 'Invictus Gaming' }
function series(
  league: EsportsLeague,
  raw: Record<string, unknown>
): EsportsSeries {
  const parsed = readEsportsSeries(league, raw)
  if (!parsed) throw Error('Invalid esports gallery series')
  return parsed
}
const worldsMatches: EsportsSeriesView[] = [
  [2434126, 1, '2026-10-23T17:00:00.000Z'],
  [2434087, 5, '2026-11-07T22:05:00.000Z'],
].map(([id, bestOf, start]) => ({
  series: series('lol', {
    id,
    tournament: worlds,
    team1: geng,
    team2: ig,
    winner: geng,
    loser: ig,
    team1_score: bestOf === 1 ? 1 : 3,
    team2_score: 0,
    bo_type: bestOf,
    start_date: start,
    status_state: 'final',
    status: 'finished',
  }),
  observedAt: null,
}))
const teamsAndPlaces = [
  [2866, 'Xipto Esports', '1st'],
  [811, 'Sharper Esports', '2nd'],
  [3351395, 'Fourdaboy', '3rd'],
  [3351391, 'Salamander', '4th'],
  [3351393, 'GODX', '5-6th'],
  [3351394, 'NongKaiTod', '5-6th'],
  [3351392, '1DAY24', '7-8th'],
  [3351390, 'OneOPae', '7-8th'],
] as const
const placed = readValorantPlacementPage(predator.id, {
  request: {
    path: '/valorant/v1/tournament_prizes',
    params: { tournament_id: predator.id },
  },
  status: 200,
  body: {
    data: teamsAndPlaces.map(([id, name, placement], i) => ({
      id: 378824 + i,
      tournament_id: predator.id,
      team: { id, name },
      placement,
    })),
  },
})
function localMarket(s: EsportsSeries, now: number): EsportsMarket {
  const teams = [s.team1, s.team2]
  if (!s.team1 || !s.team2) throw Error('Missing gallery teams')
  const id = 'gallery-' + s.league + '-' + s.id
  const answers = teams.map((team, index) => ({
    id: id + '-team-' + index,
    contractId: id,
    index,
    text: team!.name,
    p: 0.5,
    poolYes: index === 0 ? 44 : 56,
    poolNo: index === 0 ? 56 : 44,
  }))
  return {
    id,
    creatorId: MANIFOLD_SPORTS_USER_IDS[0],
    sportsProvider: 'bdl',
    sportsLeagueKey: s.league,
    sportsEventId: s.eventId,
    sportsMarketType: 'moneyline',
    sportsEntrantIds: [s.team1.id, s.team2.id],
    visibility: 'public',
    token: 'MANA',
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    addAnswersMode: 'DISABLED',
    shouldAnswersSumToOne: true,
    isResolved: false,
    closeTime: now + 3 * 60 * 60 * 1000,
    answers: s.league === 'dota' ? answers.reverse() : answers,
  }
}
function GallerySeries({ scenario, now }: { scenario: Scenario; now: number }) {
  if (scenario === 'LoL rematches')
    return (
      <EsportsTournament
        league="lol"
        tournament={worlds}
        rows={worldsMatches}
      />
    )
  if (scenario === 'Valorant placements')
    return (
      <EsportsTournament
        league="valorant"
        tournament={predator}
        rows={[]}
        placements={
          placed ? { tournamentId: predator.id, page: placed } : undefined
        }
      />
    )
  const league = scenario === 'Dota 2 live' ? 'dota' : 'cs'
  const t =
    league === 'cs'
      ? { id: 91001, name: 'North Circuit Invitational', tier: 's' }
      : { id: 91002, name: 'Harbor Masters', tier: 's' }
  const held = scenario === 'Series under review',
    hasMarket = scenario !== 'Unlinked series'
  const teams =
    league === 'cs'
      ? [
          { id: 21, name: 'Northstar' },
          { id: 22, name: 'Orbit' },
        ]
      : [
          { id: 31, name: 'Lumen' },
          { id: 32, name: 'Tidebreak' },
        ]
  function observation(id: number, scheduled: boolean): EsportsSeriesView {
    const start = new Date(now + (scheduled ? 1 : -1) * 3600000).toISOString()
    const s = series(league, {
      id,
      tournament: t,
      team1: scheduled ? { id: 41, name: 'Atlas' } : teams[0],
      team2: scheduled ? { id: 42, name: 'Kestrel' } : teams[1],
      winner: held ? teams[0] : null,
      start_time: start,
      start_date: start,
      best_of: 3,
      bo_type: 5,
      status_state: held ? 'final' : scheduled ? 'scheduled' : 'in_progress',
      status: held ? 'defwin' : scheduled ? 'upcoming' : 'live',
      team1_score: scheduled ? null : held ? 2 : 1,
      team2_score: scheduled ? null : league === 'dota' ? 2 : 0,
      ...(league === 'cs'
        ? { stage: { id: 81, name: 'Swiss stage' }, round: 'Round 2' }
        : {}),
    })
    return {
      series: s,
      observedAt: now - 4000,
      ...(hasMarket
        ? { market: localMarket(s, now), marketReadAt: now - 2000 }
        : {}),
    }
  }
  return (
    <EsportsTournament
      league={league}
      tournament={t}
      rows={
        scenario === 'CS2 live'
          ? [observation(1001, false), observation(1002, true)]
          : [observation(1003, false)]
      }
      galleryPreview
    />
  )
}
export default function EsportsScenarios() {
  const [scenario, setScenario] = useState<Scenario>('CS2 live'),
    [now] = useState(Date.now)
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-ink-900 text-xl font-semibold">Esports</h2>
        <label className="text-ink-700 flex max-w-full flex-col gap-1 text-sm">
          Scenario
          <select
            value={scenario}
            onChange={(e) => {
              const value = choices.find((x) => x === e.target.value)
              if (value) setScenario(value)
            }}
            className="border-ink-300 bg-canvas-0 text-ink-900 min-h-[44px] max-w-full rounded-md border py-2 pl-3 pr-9"
          >
            {choices.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-ink-600 text-sm">
        {scenario === 'Valorant placements' || scenario === 'LoL rematches'
          ? 'Recorded tournament results'
          : 'Synthetic series and local market preview'}
      </p>
      <GallerySeries key={scenario} scenario={scenario} now={now} />
    </div>
  )
}
