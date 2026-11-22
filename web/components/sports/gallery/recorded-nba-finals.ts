// Public sporting facts for the five-game 2026 NBA Finals gallery excerpt.
const clubs = {
  NYK: {
    id: 20,
    full_name: 'New York Knicks',
    abbreviation: 'NYK',
    conference: 'East',
  },
  SAS: {
    id: 27,
    full_name: 'San Antonio Spurs',
    abbreviation: 'SAS',
    conference: 'West',
  },
} as const

// Game ID, start (UTC), home club, visiting club and final scores in home/away order.
const games = [
  [21716134, '2026-06-04T00:30:00.000Z', 'SAS', 'NYK', 95, 105],
  [21716135, '2026-06-06T00:30:00.000Z', 'SAS', 'NYK', 104, 105],
  [21716136, '2026-06-09T00:30:00.000Z', 'NYK', 'SAS', 111, 115],
  [21716137, '2026-06-11T00:30:00.000Z', 'NYK', 'SAS', 107, 106],
  [21716138, '2026-06-14T00:30:00.000Z', 'SAS', 'NYK', 90, 94],
] as const

export const recordedNbaFinals = games.map(
  ([id, datetime, home, away, homeScore, awayScore]) => ({
    id,
    season: 2025,
    postseason: true,
    datetime,
    status_state: 'final',
    home_team: clubs[home],
    visitor_team: clubs[away],
    home_team_score: homeScore,
    visitor_team_score: awayScore,
  })
)
