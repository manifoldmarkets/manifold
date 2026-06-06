import {
  pickSportsWinningAnswer,
  buildMarketParams,
  buildDescription,
  stageLabel,
  computeCloseTime,
  flagEmoji,
  FDMatch,
  TournamentConfig,
} from './sports'

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

// ─── Market-shape builders ──────────────────────────────────────────────────────
// These lock the exact shape of every auto-created sports market (question,
// answers, tiers, groups, close time). The cron and the admin "Create markets"
// button both feed buildMarketParams' output into getNewContract, so this is the
// parity surface for what a created market looks like.

function makeMatch(overrides: Partial<FDMatch> = {}): FDMatch {
  return {
    id: 537,
    utcDate: '2026-06-15T19:00:00Z',
    status: 'SCHEDULED',
    matchday: 1,
    stage: 'GROUP_STAGE',
    group: 'GROUP_A',
    homeTeam: {
      id: 1, name: 'Brazil', shortName: 'Brazil', tla: 'BRA',
      crest: 'https://x/bra.png', area: { code: 'BRA' },
    },
    awayTeam: {
      id: 2, name: 'Argentina', shortName: 'Argentina', tla: 'ARG',
      crest: 'https://x/arg.png', area: { code: 'ARG' },
    },
    score: {
      winner: null, duration: 'REGULAR',
      fullTime: { home: null, away: null }, halfTime: { home: null, away: null },
    },
    ...overrides,
  }
}

// additionalGroupIds empty for both envs → groupIds are deterministic regardless
// of the ENV the test runs under.
function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    name: 'Test Tournament 2026',
    shortLabel: "Test '26",
    footballDataCode: 'TEST',
    sportsLeague: 'Test League',
    startDate: '2026-06-01',
    endDate: '2026-07-01',
    hasGroupStageDraws: true,
    officialGroupSlug: 'off',
    officialGroupName: 'Off',
    communityGroupSlug: 'comm',
    communityDashboardSlug: 'comm-dash',
    dashboardPath: '/sports/test',
    additionalGroupIds: { dev: [], prod: [] },
    manifoldSportsUserId: { dev: 'd', prod: 'p' },
    closeTimeOffsetMs: 2.5 * 60 * 60 * 1000,
    stageLiquidityTiers: { GROUP_STAGE: 1_000, ROUND_OF_16: 10_000, FINAL: 10_000 },
    ...overrides,
  }
}

const BR = flagEmoji('BR')
const AR = flagEmoji('AR')

describe('flagEmoji', () => {
  it('maps a 2-letter ISO code to two regional-indicator codepoints', () => {
    expect(flagEmoji('BR')).toBe(String.fromCodePoint(0x1f1e7, 0x1f1f7))
    expect([...flagEmoji('BR')]).toHaveLength(2)
  })
  it('is case-insensitive', () => {
    expect(flagEmoji('br')).toBe(flagEmoji('BR'))
  })
  it('returns empty string for invalid input', () => {
    expect(flagEmoji('X')).toBe('')
    expect(flagEmoji('USA')).toBe('')
    expect(flagEmoji('')).toBe('')
  })
})

describe('stageLabel', () => {
  it('formats group stage from the group code', () => {
    expect(stageLabel(makeMatch({ stage: 'GROUP_STAGE', group: 'GROUP_C' }))).toBe('Group C')
  })
  it('abbreviates knockout stages', () => {
    expect(stageLabel(makeMatch({ stage: 'ROUND_OF_16' }))).toBe('R16')
    expect(stageLabel(makeMatch({ stage: 'FINAL' }))).toBe('Final')
  })
  it('uses matchday for regular season / league phase', () => {
    expect(stageLabel(makeMatch({ stage: 'REGULAR_SEASON', matchday: 5 }))).toBe('MD 5')
    expect(stageLabel(makeMatch({ stage: 'LEAGUE_PHASE', matchday: 8 }))).toBe('MD 8')
  })
})

describe('computeCloseTime', () => {
  it('is kickoff plus the configured offset', () => {
    const match = makeMatch({ utcDate: '2026-06-15T19:00:00Z' })
    expect(computeCloseTime(match, makeConfig())).toBe(
      new Date('2026-06-15T19:00:00Z').getTime() + 2.5 * 60 * 60 * 1000
    )
  })
})

describe('buildMarketParams', () => {
  it('builds an international group market (flag + TLA, with Draw, no crests)', () => {
    const params = buildMarketParams(makeMatch(), makeConfig(), 'grp-official')
    expect(params.question).toBe(`${BR}BRA vs ${AR}ARG [Test '26]`)
    expect(params.answers).toEqual([`${BR} Brazil`, `${AR} Argentina`, 'Draw'])
    expect(params.answerShortTexts).toEqual([`${BR}BRA`, `${AR}ARG`, 'Draw'])
    // group stage → no advancing team → crests omitted
    expect(params.answerImageUrls).toEqual([])
    expect(params.sportsEventId).toBe('fd-537')
    expect(params.sportsLeague).toBe('Test League')
    expect(params.liquidityTier).toBe(1_000)
    expect(params.groupIds).toEqual(['grp-official'])
    expect(params.closeTime).toBe(
      new Date('2026-06-15T19:00:00Z').getTime() + 2.5 * 60 * 60 * 1000
    )
  })

  it('builds an international knockout market (no Draw, crests as images, knockout tier)', () => {
    const params = buildMarketParams(
      makeMatch({ stage: 'ROUND_OF_16', group: null }),
      makeConfig(),
      'g'
    )
    expect(params.answers).toEqual([`${BR} Brazil`, `${AR} Argentina`])
    expect(params.answerShortTexts).toEqual([`${BR}BRA`, `${AR}ARG`])
    expect(params.answerImageUrls).toEqual(['https://x/bra.png', 'https://x/arg.png'])
    expect(params.liquidityTier).toBe(10_000)
  })

  it('builds a club market with bare names (useTeamNames) — shortName in question/shortTexts', () => {
    const config = makeConfig({ useTeamNames: true })
    const match = makeMatch({
      homeTeam: { id: 1, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS', crest: '', area: { code: 'ENG' } },
      awayTeam: { id: 2, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', crest: '', area: { code: 'ENG' } },
    })
    const params = buildMarketParams(match, config, 'g')
    expect(params.question).toBe("Arsenal vs Chelsea [Test '26]")
    expect(params.answers).toEqual(['Arsenal FC', 'Chelsea FC', 'Draw'])
    expect(params.answerShortTexts).toEqual(['Arsenal', 'Chelsea', 'Draw'])
  })

  it('omits images on a knockout when any crest is missing', () => {
    const match = makeMatch({
      stage: 'FINAL',
      group: null,
      homeTeam: { id: 1, name: 'Brazil', shortName: 'Brazil', tla: 'BRA', crest: '', area: { code: 'BRA' } },
    })
    expect(buildMarketParams(match, makeConfig(), 'g').answerImageUrls).toEqual([])
  })
})

describe('buildDescription', () => {
  it('uses the draw-eligible resolve line for group stage and extracts the dashboard path', () => {
    const desc = buildDescription(makeMatch({ stage: 'GROUP_STAGE' }), makeConfig(), {
      dashboardUrl: 'https://manifold.markets/sports/test?ref=x',
    })
    expect(desc).toContain('Brazil vs Argentina')
    expect(desc).toContain('Resolves to the winning team or draw')
    // absolute URL reduced to a path so the link works on any origin
    expect(desc).toContain('[Visit the Test Tournament 2026 Dashboard](/sports/test?ref=x)')
  })

  it('uses the advancing-team resolve line for knockout stages', () => {
    const desc = buildDescription(makeMatch({ stage: 'FINAL', group: null }), makeConfig())
    expect(desc).toContain('Resolves to the advancing team')
  })

  it('substitutes custom-note tokens', () => {
    const desc = buildDescription(makeMatch(), makeConfig(), {
      customNote: '{team1} vs {team2} — {stage}',
    })
    expect(desc).toContain('Brazil vs Argentina — Group A')
  })
})
