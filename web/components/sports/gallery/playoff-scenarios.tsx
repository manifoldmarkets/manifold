import { useMemo, useState } from 'react'
import {
  projectNbaPlayoffSeries,
  type NbaPlayoffTeam,
} from 'common/bdl/nba-playoff-series'
import {
  nbaSeriesOpeningEstimate,
  type PlayoffMarket,
} from 'common/bdl/playoff-market'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import type { ProviderOdds } from 'common/sports-provider'
import { DAY_MS } from 'common/util/time'
import { PlayoffBracket } from '../playoff-bracket'
import recordedFinals from '../../../../backend/shared/test/fixtures/bdl/nba/games__2025-playoff-finals.json'

const scenarios = [
  'Active series',
  'Season complete',
  'Correction under review',
  'No linked market',
  'Recorded 2026 Finals',
] as const
type Scenario = (typeof scenarios)[number]
const names = [
  'Harbor Comets',
  'Civic Royals',
  'Summit Owls',
  'River Pilots',
  'Prairie Stars',
  'Metro Falcons',
  'Lakeside Waves',
  'Union Knights',
  'Pacific Pines',
  'Canyon Foxes',
  'Valley Bears',
  'Westport Sparks',
  'Desert Lynx',
  'Coastal Flyers',
  'Mesa Suns',
  'Redwood Oaks',
]
function sampleTeams() {
  return names.map((name, i) => ({
    id: i + 1,
    full_name: name,
    abbreviation: name
      .split(' ')
      .map((x) => x[0])
      .join(''),
    conference: i < 8 ? 'East' : 'West',
  }))
}
function sample(season: number, scenario: Scenario, now: number) {
  if (scenario === 'Recorded 2026 Finals')
    return {
      bracket: projectNbaPlayoffSeries(2025, recordedFinals.data, false),
      markets: [],
    }
  const teams = sampleTeams(),
    completed = scenario === 'Season complete'
  const games = []
  let entrants = teams
  for (let round = 1; round <= 4; round++) {
    const next = []
    for (let pair = 0; pair < entrants.length; pair += 2) {
      const a = entrants[pair],
        b = entrants[pair + 1],
        active = !completed && round === 2,
        count = active ? 7 : 4
      for (let g = 0; g < count; g++) {
        const pending = active && g >= 3,
          home = g % 2 === 0 ? a : b,
          away = g % 2 === 0 ? b : a
        const aWon = !active || g !== 1
        const high = 99 + g,
          low = 92 + g
        const at = active
          ? now + (g - 2.5) * DAY_MS
          : now - (50 - round * 9 - g) * DAY_MS
        games.push({
          id: 10000 * round + 100 * pair + g + 1,
          season,
          postseason: true,
          datetime: new Date(at).toISOString(),
          status_state: pending ? 'scheduled' : 'final',
          home_team: home,
          visitor_team: away,
          home_team_score: pending
            ? null
            : (home.id === a.id) === aWon
            ? high
            : low,
          visitor_team_score: pending
            ? null
            : (away.id === a.id) === aWon
            ? high
            : low,
        })
      }
      next.push(a)
    }
    entrants = next
    if (round === 2 && !completed) break
  }
  const bracket = projectNbaPlayoffSeries(season, games, true)
  if (scenario === 'No linked market') return { bracket, markets: [] }
  function market(
    eventId: string,
    kind: 'series' | 'champion',
    runners: readonly NbaPlayoffTeam[],
    probs: number[],
    settled: boolean
  ): PlayoffMarket {
    const id = 'gallery-playoffs-' + eventId
    return {
      id,
      creatorId: MANIFOLD_SPORTS_USER_IDS[0],
      token: 'MANA',
      visibility: 'public',
      sportsProvider: 'bdl',
      sportsLeagueKey: 'nba',
      sportsEventId: eventId,
      sportsMarketType: kind,
      addAnswersMode: 'DISABLED',
      outcomeType: 'MULTIPLE_CHOICE',
      mechanism: 'cpmm-multi-2',
      shouldAnswersSumToOne: true,
      isResolved: settled,
      closeTime: now + DAY_MS,
      sportsAttentionReason:
        scenario === 'Correction under review'
          ? 'Series result needs review'
          : undefined,
      sportsEntrantIds: runners.map((t) => t.id),
      answers: runners.map((t, index) => ({
        id: id + '-' + t.id,
        index,
        contractId: id,
        text: t.name,
        p: 0.5,
        poolYes: 100 * (1 - probs[index]),
        poolNo: 100 * probs[index],
      })),
    }
  }
  const markets = bracket.series.map((s) => {
    const lines: ProviderOdds[] = s.games
      .filter((g) => g.status === 'scheduled')
      .map((g) => ({
        eventId: 'bdl:nba:' + g.id,
        updatedAtMs: now - 1000,
        vendor: 'Example book',
        outcomes: [
          { outcome: { entrantId: String(g.homeId) }, americanOdds: -120 },
          { outcome: { entrantId: String(g.awayId) }, americanOdds: 110 },
        ],
      }))
    const estimate = nbaSeriesOpeningEstimate(bracket, s.eventId, lines, now)
    const p = estimate?.probability ?? 0.5
    return market(s.eventId, 'series', s.teams, [p, 1 - p], s.winnerId !== null)
  })
  const field = bracket.series
    .filter((s) => s.round === 1)
    .flatMap((s) => s.teams)
  const eliminated = new Set(
    bracket.series.flatMap((s) =>
      s.winnerId
        ? s.teams.filter((t) => t.id !== s.winnerId).map((t) => t.id)
        : []
    )
  )
  const weights = field.map((t) => (eliminated.has(t.id) ? 1 : 20 - t.id / 2)),
    total = weights.reduce((v, x) => v + x, 0)
  markets.push(
    market(
      bracket.championEventId,
      'champion',
      field,
      weights.map((w) => w / total),
      !!bracket.champion
    )
  )
  return { bracket, markets }
}
export default function PlayoffScenarios() {
  const [scenario, setScenario] = useState<Scenario>('Active series')
  const [readAt] = useState(Date.now)
  const { bracket, markets } = useMemo(
    () => sample(2025, scenario, readAt),
    [scenario, readAt]
  )
  return (
    <section aria-label="Playoff series gallery" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">NBA playoffs</h2>
        <label className="text-ink-700 text-sm">
          Scenario{' '}
          <select
            className="bg-canvas-0 border-ink-300 min-h-[44px] max-w-full rounded border py-2 pl-2 pr-9"
            value={scenario}
            onChange={(e) => {
              const mode = scenarios.find((s) => s === e.target.value)
              if (mode) setScenario(mode)
            }}
          >
            {scenarios.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-ink-600 text-sm">
        {scenario === 'Recorded 2026 Finals'
          ? 'Five recorded Finals games from the 2025 NBA season. The complete bracket and historical market prices are unavailable in this excerpt.'
          : 'Sample teams and Manifold pools. Picks stay in this gallery.'}
      </p>
      <PlayoffBracket
        key={scenario}
        bracket={bracket}
        markets={markets}
        readAt={readAt}
        galleryPreview
      />
    </section>
  )
}
