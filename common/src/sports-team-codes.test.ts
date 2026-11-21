import { groupBy } from 'lodash'
import { SportId } from './sports-calendar'
import { TEAM_PALETTES } from './sports-team-colors'
import { TEAM_CODES, teamCode, teamCodeForLeague } from './sports-team-codes'

describe('team codes', () => {
  it('lists the same teams as the team colours', () => {
    for (const sport of Object.keys(TEAM_PALETTES) as SportId[]) {
      const palettes = TEAM_PALETTES[sport]!
      const codes = TEAM_CODES[sport] ?? {}
      expect([
        sport,
        Object.keys(palettes).filter((t) => !(t in codes)),
      ]).toEqual([sport, []])
      expect([
        sport,
        Object.keys(codes).filter((t) => !(t in palettes)),
      ]).toEqual([sport, []])
    }
  })

  it('gives each team its own code, short enough for the badge', () => {
    for (const sport of Object.keys(TEAM_CODES) as SportId[]) {
      const codes = TEAM_CODES[sport]!
      for (const code of Object.values(codes))
        expect([sport, code]).toEqual([
          sport,
          expect.stringMatching(/^[A-Z]{2,3}$/),
        ])
      // Two names share a code only when they are the same club
      // ("Athletics" and "Oakland Athletics"), so the same colours.
      const palettes = TEAM_PALETTES[sport]!
      for (const [code, names] of Object.entries(
        groupBy(Object.keys(codes), (name) => codes[name])
      )) {
        const teams = new Set(names.map((n) => JSON.stringify(palettes[n])))
        expect([sport, code, teams.size]).toEqual([sport, code, 1])
      }
    }
  })

  it('reads the names the provider uses', () => {
    expect(teamCode('mlb', 'New York Yankees')).toBe('NYY')
    expect(teamCode('soccer', 'AFC Bournemouth')).toBe('BOU')
    expect(teamCode('soccer', 'Brighton & Hove Albion')).toBe('BHA')
    expect(teamCode('nhl', 'Montréal Canadiens')).toBe('MTL')
    expect(teamCode('nhl', 'St Louis Blues')).toBe('STL')
    expect(teamCode('nhl', 'Utah Hockey Club')).toBe('UTA')
    // Codes are per sport.
    expect(teamCode('mlb', 'Kansas City Chiefs')).toBeUndefined()
  })

  it("finds a code from a market's league", () => {
    expect(teamCodeForLeague('MLB', 'Tampa Bay Rays')).toBe('TB')
    expect(teamCodeForLeague('Soccer', 'Hull City')).toBe('HUL')
    expect(teamCodeForLeague('Soccer', 'Toronto FC')).toBeUndefined()
    expect(teamCodeForLeague(undefined, 'Arsenal')).toBeUndefined()
  })
})
