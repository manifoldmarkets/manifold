import { useMemo, useState } from 'react'
import {
  collegeGame,
  type CollegeBasketballLeague,
  type CollegeGame,
} from 'common/bdl/college-games'
import { projectCollegeBracket } from 'common/bdl/college-bracket'
import type { ScheduleTeam } from 'common/sports-schedule'
import { BracketView, type CollegeMarket } from '../college-bracket'

const states = ['Upcoming', 'Live', 'Complete', 'Unavailable'] as const
type State = (typeof states)[number]
type Team = {
  id: number
  full_name: string
  abbreviation: string
  seed: string
}
const names = [
  'Alder',
  'Beacon',
  'Cinder',
  'Dune',
  'Ember',
  'Flint',
  'Grove',
  'Haven',
  'Iris',
  'Juniper',
  'Kestrel',
  'Lark',
  'Maple',
  'Northwind',
  'Opal',
  'Pine',
  'Quartz',
]
const campuses = ['Point', 'Ridge', 'Bay', 'Glen']
function entrant(id: number): Team {
  return {
    id,
    full_name: names[(id - 1) % 17] + ' ' + campuses[Math.floor((id - 1) / 17)],
    abbreviation: 'C' + id,
    seed: String(((id - 1) % 16) + 1),
  }
}
const season = 2026,
  tip = Date.UTC(2027, 2, 16, 19),
  now = tip + 2 * 60 * 60 * 1000
const displayTeam = (team: Team, prob: number): ScheduleTeam => ({
  name: team.full_name,
  shortName: team.abbreviation,
  entrantId: String(team.id),
  answerId: 'sample-answer-' + team.id,
  prob,
  flag: '',
  imageUrl: null,
  color: null,
})

// These 68 fictional campuses and Manifold pool prices are exclusive to the admin gallery.
function sample(league: CollegeBasketballLeague, state: State) {
  const rows: unknown[] = [],
    ordinary: CollegeGame[] = [],
    markets: CollegeMarket[] = []
  const game = (
    round: number,
    position: number,
    home: Team | null,
    away: Team | null
  ): Team | null => {
    const id = 1000 + 100 * round + position,
      date = new Date(tip + round * 86400000 + position * 60000).toISOString()
    const final =
      state === 'Complete' ||
      (state === 'Live' && (round === 0 || (round === 1 && position < 3)))
    const live = state === 'Live' && round === 1 && position === 3
    const status = final ? 'final' : live ? 'in_progress' : 'scheduled',
      h = final ? 73 : live ? 34 : null,
      a = final ? 67 : live ? 31 : null
    const region =
      round > 0 && round < 5
        ? ['North', 'East', 'South', 'West'][
            Math.floor((position - 1) / (32 / 2 ** (round - 1) / 4))
          ]
        : null
    const row = {
      season,
      round,
      bracket_location: position,
      game_id: home && away ? id : null,
      date,
      region_label: region,
      status_state: status,
      home_team: home && { ...home, score: h, winner: final ? true : null },
      away_team: away && { ...away, score: a, winner: null },
    }
    rows.push(row)
    if (home && away) {
      const g = collegeGame(league, {
        id,
        season,
        date,
        status_state: status,
        home_team: home,
        visitor_team: away,
        home_score: h,
        away_score: a,
      })
      ordinary.push(g)
      if (
        !final &&
        ((round === 0 && position === 1) || (round === 1 && position === 3))
      ) {
        const extreme = round === 0
        markets.push({
          id: 'fixture-college-' + id,
          homeApRank: 12,
          slug: 'fictional-' + id,
          creatorUsername: 'Gallery',
          sportsEventId: g.eventId,
          sportsLeagueKey: league,
          sport: 'basketball',
          league: 'Gallery',
          question: away.full_name + ' at ' + home.full_name,
          startTime: Date.parse(date),
          kickoffKnown: true,
          closeTime: now + 86400000,
          status: live ? 'live' : 'upcoming',
          gameState: live ? 'live' : 'scheduled',
          home: displayTeam(home, extreme ? 0.006 : 0.58),
          away: displayTeam(away, extreme ? 0.994 : 0.42),
          draw: null,
          isResolved: false,
          resolutionTime: null,
          winnerAnswerId: null,
          liveScore: null,
          finalScore: null,
          related: [],
          relatedCount: 0,
          uniqueBettorCount: 0,
          volume: 0,
        })
      }
    }
    return final ? home : null
  }
  if (state !== 'Unavailable') {
    const playIn = Array.from({ length: 4 }, (_, i) =>
      game(0, i + 1, entrant(61 + 2 * i), entrant(62 + 2 * i))
    )
    let direct = 1
    let round: (Team | null)[] = Array.from({ length: 64 }, (_, i) => {
      const slot = [1, 17, 39, 60].indexOf(i)
      return slot >= 0 ? playIn[slot] : entrant(direct++)
    })
    for (let n = 1; n <= 6; n++) {
      const next: (Team | null)[] = []
      for (let i = 0; i < round.length; i += 2)
        next.push(game(n, i / 2 + 1, round[i], round[i + 1]))
      round = next
    }
  }
  return {
    bracket: projectCollegeBracket(league, season, rows, ordinary),
    markets,
  }
}

export default function CollegeScenarios() {
  const [league, setLeague] = useState<CollegeBasketballLeague>('ncaab'),
    [state, setState] = useState<State>('Live')
  const model = useMemo(() => sample(league, state), [league, state])
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label>
          Tournament
          <select
            value={league}
            onChange={(e) =>
              setLeague(e.target.value === 'ncaaw' ? 'ncaaw' : 'ncaab')
            }
            className="bg-canvas-0 border-ink-300 mt-1 block min-h-[44px] rounded border px-2"
          >
            <option value="ncaab">Men's</option>
            <option value="ncaaw">Women's</option>
          </select>
        </label>
        <label>
          Scenario
          <select
            value={state}
            onChange={(e) => {
              const next = states.find((s) => s === e.target.value)
              if (next) setState(next)
            }}
            className="bg-canvas-0 border-ink-300 mt-1 block min-h-[44px] rounded border px-2"
          >
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <p className="text-ink-600">Fictional teams and market prices.</p>
      </div>
      <BracketView {...model} now={now} preview />
    </>
  )
}
