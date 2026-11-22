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
const regionalSeeds = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15]
const playInBerths = [1, 17, 41, 57]
function entrant(id: number, seed: number): Team {
  return {
    id,
    full_name: names[(id - 1) % 17] + ' ' + campuses[Math.floor((id - 1) / 17)],
    abbreviation: 'C' + id,
    seed: String(seed),
  }
}
const season = 2026,
  tip = Date.UTC(2027, 2, 16, 17)
const hour = 3600000
const roundDays = [0, 2, 6, 10, 12, 18, 20]
function gameTime(round: number, position: number) {
  // Two courts per session, four sessions per day.
  const session = Math.floor((position - 1) / 2)
  return (
    tip +
    (roundDays[round] + Math.floor(session / 4)) * 24 * hour +
    (session % 4) * 3 * hour +
    (((position - 1) % 2) * hour) / 2
  )
}
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
  const now =
    state === 'Live'
      ? gameTime(1, 3) + 25 * 60000
      : state === 'Complete'
      ? gameTime(6, 1) + 3 * hour
      : tip - 2 * hour
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
      date = new Date(gameTime(round, position)).toISOString()
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
          closeTime: Date.parse(date) + 4 * hour,
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
    const playIn = playInBerths.map((berth, i) => {
      const seed = regionalSeeds[berth % 16]
      return game(
        0,
        i + 1,
        entrant(61 + 2 * i, seed),
        entrant(62 + 2 * i, seed)
      )
    })
    let direct = 1
    let round: (Team | null)[] = Array.from({ length: 64 }, (_, i) => {
      const slot = playInBerths.indexOf(i)
      return slot >= 0 ? playIn[slot] : entrant(direct++, regionalSeeds[i % 16])
    })
    for (let n = 1; n <= 6; n++) {
      const next: (Team | null)[] = []
      for (let i = 0; i < round.length; i += 2)
        next.push(game(n, i / 2 + 1, round[i], round[i + 1]))
      round = next
    }
  }
  return {
    now,
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
            className="bg-canvas-0 border-ink-300 mt-1 block min-h-[44px] rounded border pl-2 pr-9"
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
            className="bg-canvas-0 border-ink-300 mt-1 block min-h-[44px] rounded border pl-2 pr-9"
          >
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <p className="text-ink-600">Fictional teams and market prices.</p>
      </div>
      <BracketView {...model} preview />
    </>
  )
}
