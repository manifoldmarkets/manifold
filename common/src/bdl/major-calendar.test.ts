import {
  autoCreates,
  calendarPhaseKey,
  competitionSwitchError,
  SPORTS_CALENDAR,
} from '../sports-calendar'
import { MAJOR_LEAGUES } from './major-leagues'

const majors = SPORTS_CALENDAR.filter((p) => p.provider === 'bdl')
const nba = majors.find((p) => p.competitionId === 'nba-regular-2026-27')!
const legacy = SPORTS_CALENDAR.find(
  (p) => p.competitionId === nba.competitionId && !!p.oddsKey
)!
it('starts all five major leagues off and keeps the previous NFL season with its existing provider', () => {
  expect(new Set(majors.map((p) => p.bdlLeagueKey))).toEqual(
    new Set(MAJOR_LEAGUES)
  )
  expect(majors.every((p) => !autoCreates(p, {}))).toBe(true)
  expect(
    majors.filter((p) => p.bdlLeagueKey === 'nfl').map((p) => p.competitionId)
  ).toEqual(['nfl-regular-2027'])
  expect(new Set(SPORTS_CALENDAR.map(calendarPhaseKey)).size).toBe(
    SPORTS_CALENDAR.length
  )
})
it('allows one creator per league across overlapping phase switches in either direction', () => {
  const check = (
    p: typeof nba,
    on: boolean,
    switches: Record<string, boolean>
  ) => competitionSwitchError(p.competitionId, p.phase, on, switches)
  expect(check(nba, true, { [calendarPhaseKey(legacy)]: true })).toContain(
    'Switch off'
  )
  expect(check(legacy, true, { [calendarPhaseKey(nba)]: true })).toContain(
    'Switch off'
  )
  expect(
    check(nba, true, { [calendarPhaseKey(legacy)]: false })
  ).toBeUndefined()
  expect(
    check(nba, false, { [calendarPhaseKey(legacy)]: true })
  ).toBeUndefined()
  const playoffs = SPORTS_CALENDAR.find(
    (p) => p.competitionId === 'nba-playoffs-2027' && p.oddsKey
  )!
  expect(
    check(nba, true, {
      [calendarPhaseKey(legacy)]: false,
      [calendarPhaseKey(playoffs)]: true,
    })
  ).toBeUndefined()
})
