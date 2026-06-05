import { pickSportsWinningAnswer } from './sports'

describe('pickSportsWinningAnswer', () => {
  // Knockout match — answers carry bare team names, no Draw answer.
  const knockoutClubAnswers = [
    { id: 'a1', text: 'Real Madrid' },
    { id: 'a2', text: 'Manchester City' },
  ]
  // Group stage match in a club tournament (useTeamNames: true).
  const groupClubAnswers = [
    { id: 'a1', text: 'Arsenal' },
    { id: 'a2', text: 'Chelsea' },
    { id: 'a3', text: 'Draw' },
  ]
  // Group stage match in an international tournament (flag-prefixed names).
  const intlAnswers = [
    { id: 'a1', text: '🇧🇷 Brazil' },
    { id: 'a2', text: '🇲🇦 Morocco' },
    { id: 'a3', text: 'Draw' },
  ]
  // Knockout match in an international tournament.
  const intlKnockoutAnswers = [
    { id: 'a1', text: '🇧🇷 Brazil' },
    { id: 'a2', text: '🇫🇷 France' },
  ]

  it('returns the home team for a club knockout match', () => {
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Real Madrid',
        awayTeamName: 'Manchester City',
        winner: 'HOME_TEAM',
      },
      knockoutClubAnswers
    )
    expect(result).toEqual({ id: 'a1', text: 'Real Madrid' })
  })

  it('returns the away team for a club group match', () => {
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Arsenal',
        awayTeamName: 'Chelsea',
        winner: 'AWAY_TEAM',
      },
      groupClubAnswers
    )
    expect(result).toEqual({ id: 'a2', text: 'Chelsea' })
  })

  it('returns the Draw answer for a club group draw', () => {
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Arsenal',
        awayTeamName: 'Chelsea',
        winner: 'DRAW',
      },
      groupClubAnswers
    )
    expect(result).toEqual({ id: 'a3', text: 'Draw' })
  })

  it('matches the home team via flag-prefix suffix in an intl group match', () => {
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Brazil',
        awayTeamName: 'Morocco',
        winner: 'HOME_TEAM',
      },
      intlAnswers
    )
    expect(result).toEqual({ id: 'a1', text: '🇧🇷 Brazil' })
  })

  it('matches the away team via flag-prefix suffix in an intl knockout match', () => {
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Brazil',
        awayTeamName: 'France',
        winner: 'AWAY_TEAM',
      },
      intlKnockoutAnswers
    )
    expect(result).toEqual({ id: 'a2', text: '🇫🇷 France' })
  })

  it('returns null when the match has no winner recorded', () => {
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Brazil',
        awayTeamName: 'Morocco',
        winner: null,
      },
      intlAnswers
    )
    expect(result).toBeNull()
  })

  it('returns null when the winner cannot be matched to any answer', () => {
    // Data anomaly: backend resolves to a team that isn't an answer
    // (e.g. team rename mid-tournament). Worth surfacing as an error log.
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Unknown Team',
        awayTeamName: 'Other Team',
        winner: 'HOME_TEAM',
      },
      intlAnswers
    )
    expect(result).toBeNull()
  })

  it('rescues a partial rename via trailing-space match (acceptable for 1v1 markets)', () => {
    // football-data occasionally renames teams mid-tournament. Sports markets
    // are always 1v1 (home + away [+ Draw]), so a trailing-space suffix match
    // can never collide with the other side. If FB later abbreviates a team
    // name to "Korea" but the market answer was created as "South Korea",
    // we still resolve correctly.
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Korea',
        awayTeamName: 'Japan',
        winner: 'HOME_TEAM',
      },
      [
        { id: 'a1', text: 'South Korea' },
        { id: 'a2', text: 'Japan' },
      ]
    )
    expect(result).toEqual({ id: 'a1', text: 'South Korea' })
  })

  it('does NOT match on a bare-prefix substring (no leading space)', () => {
    // "Korea Republic" should NOT match a query for "Korea Repub" or "Korea".
    // Trailing-suffix-only protects against arbitrary substring collisions.
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Korea Repub',
        awayTeamName: 'Japan',
        winner: 'HOME_TEAM',
      },
      [
        { id: 'a1', text: 'Korea Republic' },
        { id: 'a2', text: 'Japan' },
      ]
    )
    expect(result).toBeNull()
  })

  it('disambiguates between two teams sharing a substring via the flag prefix', () => {
    // United States vs USA-with-flag should match the exact flag-prefixed answer.
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'United States',
        awayTeamName: 'Canada',
        winner: 'HOME_TEAM',
      },
      [
        { id: 'a1', text: '🇺🇸 United States' },
        { id: 'a2', text: '🇨🇦 Canada' },
      ]
    )
    expect(result).toEqual({ id: 'a1', text: '🇺🇸 United States' })
  })

  it('returns null for an empty answers array', () => {
    const result = pickSportsWinningAnswer(
      {
        homeTeamName: 'Brazil',
        awayTeamName: 'Morocco',
        winner: 'HOME_TEAM',
      },
      []
    )
    expect(result).toBeNull()
  })
})
