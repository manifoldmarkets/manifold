import { VERSUS_COLORS } from './new-contract'
import { NFL_TEAM_TLA } from './sports'
import { SportId } from './sports-calendar'
import {
  ciede2000,
  colorDistance,
  DRAW_COLOR,
  fitLuminance,
  gameAnswerColorBackfill,
  gameAnswerColors,
  LuminanceBand,
  pickTeamColor,
  readableTextColor,
  relativeLuminance,
  TEAM_PALETTES,
  teamPalette,
  THREE_WAY_BAND,
  VERSUS_BAND,
} from './sports-team-colors'

// Hex rounding can land a hair outside the band the bisection aimed for.
const expectInBand = (hex: string, band: LuminanceBand) => {
  const luminance = relativeLuminance(hex)
  expect(luminance).toBeGreaterThanOrEqual(band.min - 0.005)
  expect(luminance).toBeLessThanOrEqual(band.max + 0.005)
}

const sports = Object.keys(TEAM_PALETTES) as SportId[]

describe('colour maths', () => {
  it('matches the CIEDE2000 reference data', () => {
    // Sharma, Wu & Dalal (2005), pairs 1, 17 and 25.
    expect(ciede2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(
      2.0425,
      4
    )
    expect(ciede2000([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 4)
    expect(
      ciede2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])
    ).toBeCloseTo(1.2644, 4)
  })

  it('tells colour families apart', () => {
    // Two reds, and two royal blues, read as one colour.
    expect(colorDistance('#C8102E', '#DD0000')).toBeLessThan(20)
    expect(colorDistance('#003594', '#0B2265')).toBeLessThan(20)
    // Red against gold, or blue against green, does not.
    expect(colorDistance('#E31837', '#B3995D')).toBeGreaterThan(20)
    expect(colorDistance('#0045BF', '#135B43')).toBeGreaterThan(20)
  })

  it('leaves a colour already inside the band alone', () => {
    expect(fitLuminance('#e31837', VERSUS_BAND)).toBe('#E31837')
  })

  it('lightens a navy and darkens a gold, keeping the hue', () => {
    const navy = fitLuminance('#002244', VERSUS_BAND)
    expectInBand(navy, VERSUS_BAND)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(navy.slice(i, i + 2), 16))
    expect(b).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(g)

    const gold = fitLuminance('#FFB612', VERSUS_BAND)
    expectInBand(gold, VERSUS_BAND)
    const [gr, gg, gb] = [1, 3, 5].map((i) =>
      parseInt(gold.slice(i, i + 2), 16)
    )
    expect(gr).toBeGreaterThan(gg)
    expect(gg).toBeGreaterThan(gb)
  })

  it('fits every team colour into both bands', () => {
    for (const sport of sports) {
      for (const palette of Object.values(TEAM_PALETTES[sport]!)) {
        for (const color of palette) {
          expectInBand(fitLuminance(color, VERSUS_BAND), VERSUS_BAND)
          expectInBand(fitLuminance(color, THREE_WAY_BAND), THREE_WAY_BAND)
        }
      }
    }
  })

  it('picks white text on dark colours and black on light ones', () => {
    expect(readableTextColor('#0B2265')).toBe('#FFFFFF')
    expect(readableTextColor('#FFB612')).toBe('#000000')
  })
})

describe('team colours', () => {
  it('has colours for every NFL team the short names know', () => {
    for (const team of Object.keys(NFL_TEAM_TLA))
      expect(teamPalette('nfl', team)).toBeDefined()
  })

  it('matches names loosely', () => {
    expect(teamPalette('soccer', 'Brighton & Hove Albion')).toBe(
      teamPalette('soccer', 'Brighton and Hove Albion')
    )
    expect(teamPalette('soccer', 'Arsenal FC')).toBe(
      teamPalette('soccer', 'Arsenal')
    )
    expect(teamPalette('mlb', 'St Louis Cardinals')).toBeDefined()
    expect(teamPalette('nfl', 'Arsenal')).toBeUndefined()
  })

  it('prefers a real colour to black, white or grey', () => {
    expect(pickTeamColor(['#000000', '#A5ACAF', '#C8102E'], VERSUS_BAND)).toBe(
      fitLuminance('#C8102E', VERSUS_BAND)
    )
    // A team with nothing else still gets its black, lifted off the floor.
    const black = pickTeamColor(['#000000'], VERSUS_BAND)!
    expectInBand(black, VERSUS_BAND)
  })

  it('skips a colour too close to one already taken', () => {
    const red = fitLuminance('#E31837', VERSUS_BAND)
    expect(pickTeamColor(['#AA0000', '#B3995D'], VERSUS_BAND, [red])).toBe(
      fitLuminance('#B3995D', VERSUS_BAND)
    )
    expect(pickTeamColor(['#AA0000'], VERSUS_BAND, [red])).toBeUndefined()
  })

  it('gives a versus game two distinct colours, home first', () => {
    const colors = gameAnswerColors(
      'nfl',
      'Kansas City Chiefs',
      'San Francisco 49ers',
      false
    )!
    expect(colors).toHaveLength(2)
    // Both teams are red first: the 49ers fall back to their gold.
    expect(colors[0]).toBe(fitLuminance('#E31837', VERSUS_BAND))
    expect(colors[1]).toBe(fitLuminance('#B3995D', VERSUS_BAND))
  })

  it('gives a three-way game a neutral Draw', () => {
    const colors = gameAnswerColors(
      'soccer',
      'Arsenal',
      'Manchester United',
      true
    )!
    expect(colors).toHaveLength(3)
    expect(colors[2]).toBe(DRAW_COLOR)
    colors.forEach((c) => expectInBand(c, THREE_WAY_BAND))
  })

  it('keeps the defaults for a team it does not know', () => {
    expect(
      gameAnswerColors('nfl', 'Kansas City Chiefs', 'Toronto Argonauts', false)
    ).toBeUndefined()
    expect(gameAnswerColors('cfb', 'Alabama', 'Georgia', false)).toBeUndefined()
  })

  it('keeps the defaults when no pair is far enough apart', () => {
    // Blue against blue, and Everton's white would be grey like the Draw.
    expect(
      gameAnswerColors('soccer', 'Chelsea', 'Everton', true)
    ).toBeUndefined()
  })

  it('never hands out two colours that read as one', () => {
    let colored = 0
    let games = 0
    for (const sport of sports) {
      const teams = Object.keys(TEAM_PALETTES[sport]!)
      const threeWay = sport === 'soccer'
      const band = threeWay ? THREE_WAY_BAND : VERSUS_BAND
      for (const home of teams) {
        for (const away of teams) {
          if (home === away) continue
          games++
          const colors = gameAnswerColors(sport, home, away, threeWay)
          if (!colors) continue
          colored++
          colors.forEach((c) => expectInBand(c, band))
          for (let i = 0; i < colors.length; i++)
            for (let j = i + 1; j < colors.length; j++)
              expect(
                colorDistance(colors[i], colors[j])
              ).toBeGreaterThanOrEqual(20)
        }
      }
    }
    // Most games get team colours; the rest keep the defaults.
    expect(colored / games).toBeGreaterThan(0.9)
  })
})

describe('colouring games created before team colours', () => {
  const nfl = {
    sportsLeague: 'NFL',
    sportsHomeTeam: 'Kansas City Chiefs',
    sportsAwayTeam: 'Buffalo Bills',
  }
  const versus = (colors: (string | undefined)[] = VERSUS_COLORS) =>
    [nfl.sportsHomeTeam, nfl.sportsAwayTeam].map((text, index) => ({
      id: `a${index}`,
      index,
      text,
      color: colors[index],
    }))

  it('recolours a versus market still on the default pair', () => {
    const colors = gameAnswerColors(
      'nfl',
      nfl.sportsHomeTeam,
      nfl.sportsAwayTeam,
      false
    )!
    expect(gameAnswerColorBackfill(nfl, versus())).toEqual([
      { id: 'a0', color: colors[0] },
      { id: 'a1', color: colors[1] },
    ])
    // Answers arrive in any order; the index says which is home.
    expect(gameAnswerColorBackfill(nfl, versus().reverse())).toEqual([
      { id: 'a0', color: colors[0] },
      { id: 'a1', color: colors[1] },
    ])
  })

  it('recolours a three-way market on the chart palette', () => {
    const soccer = {
      sportsLeague: 'Soccer',
      sportsHomeTeam: 'Arsenal',
      sportsAwayTeam: 'Manchester United',
    }
    const answers = ['Arsenal', 'Manchester United', 'Draw'].map(
      (text, index) => ({ id: `a${index}`, index, text, color: undefined })
    )
    expect(
      gameAnswerColorBackfill(soccer, answers)?.map((a) => a.color)
    ).toEqual(gameAnswerColors('soccer', 'Arsenal', 'Manchester United', true))
  })

  it('leaves colours someone chose alone', () => {
    expect(
      gameAnswerColorBackfill(nfl, versus(['#123456', '#654321']))
    ).toBeUndefined()
  })

  it('leaves renamed answers and other markets alone', () => {
    const renamed = versus()
    renamed[0].text = 'Chiefs'
    expect(gameAnswerColorBackfill(nfl, renamed)).toBeUndefined()
    expect(
      gameAnswerColorBackfill({ ...nfl, sportsLeague: 'NHL' }, versus())
    ).toBeUndefined()
    expect(
      gameAnswerColorBackfill(
        { ...nfl, sportsLeague: 'College Football' },
        versus()
      )
    ).toBeUndefined()
  })
})
