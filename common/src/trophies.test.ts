import {
  LEAGUE_SHOWCASE_PIN,
  MAX_SHOWCASE_PINS,
  ONBOARDING_MILESTONES,
  STARTER_STAT_KEYS,
  TROPHY_DEFINITIONS,
  TROPHY_STAT_KEYS,
  RANKED_TROPHY_DEFINITIONS,
  formatLeagueRemaining,
  getNetWorthStatus,
  TROPHY_TIER_ORDER,
  getLeagueLevel,
  getHeldTrophyTitles,
  getPeakRankTier,
  getTrophyRankTier,
  getTrophyRankTitle,
  TrophyClaim,
  TrophyPrizeAccount,
  countClaimedMilestones,
  formatMembershipResult,
  getMilestonePrizesFor,
  getRankPrizeRewardId,
  getRankPrizeTierFromRewardId,
  getRankPrizeTiers,
  getRankTierPrize,
  getTrophyClaimPrize,
  getTrophyPrizeStanding,
  getTrophyRewardMultiplier,
  isRankPrizeRewardId,
  getTrophyDefinitionsFor,
  getTrophyDisplayStats,
  isStarterTrophy,
  isStarterTrophyAccount,
  countEarnedMilestones,
  countReachedMilestones,
  getAccountAnniversaryTime,
  countUnclaimedReachedMilestones,
  formatTrophyValue,
  getHighestClaimedMilestone,
  getClaimableMilestones,
  getClaimableOnboardingMilestones,
  getNextOnboardingMilestone,
  getHighestMilestone,
  getMaxShowcasePins,
  getMilestonesToClaim,
  getNextMilestone,
  getShowcasePinsError,
  getTrophyDefinition,
  getTrophyIdFromPin,
  getTrophyPinId,
  getTrophyStatValue,
  selectTrophyUnlockToasts,
} from './trophies'
import {
  EMPTY_PRIZE_TOTAL,
  RANK_TIER_PRIZES,
  applyPrizeStanding,
  getMilestonePrize,
  isEmptyPrizeTotal,
  totalPrizes,
} from './trophy-prizes'
import { EFFECTIVE_TIER_ORDER } from './supporter-config'

const claim = (trophyId: string, milestoneId: string): TrophyClaim => ({
  trophyId,
  milestoneId,
  claimedTime: 0,
})

const netWorth = getTrophyDefinition('net-worth')!

describe('trophy definitions', () => {
  it('have unique, slug-shaped trophy ids', () => {
    const ids = TROPHY_DEFINITIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  // user_trophy_rewards keeps rank title prizes next to milestone prizes,
  // under ids with a colon. A milestone id must never look like one.
  it('have slug-shaped milestone ids that no rank prize id can match', () => {
    for (const def of TROPHY_DEFINITIONS) {
      for (const m of def.milestones) {
        expect([def.id, m.id]).toEqual([
          def.id,
          expect.stringMatching(/^[a-z0-9-]+$/),
        ])
        expect(isRankPrizeRewardId(m.id)).toBe(false)
        expect(getRankPrizeTierFromRewardId(m.id)).toBeNull()
      }
    }
  })

  it('have unique, slug-shaped milestone ids within each trophy', () => {
    for (const def of TROPHY_DEFINITIONS) {
      const ids = def.milestones.map((m) => m.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('have strictly ascending, finite, non-negative thresholds', () => {
    for (const def of TROPHY_DEFINITIONS) {
      expect(def.milestones.length).toBeGreaterThan(0)
      def.milestones.forEach((m, i) => {
        expect(Number.isFinite(m.threshold)).toBe(true)
        expect(m.threshold).toBeGreaterThanOrEqual(0)
        if (i > 0) {
          expect(m.threshold).toBeGreaterThan(def.milestones[i - 1].threshold)
        }
      })
    }
  })

  it('assigns the Spectrum in order on every main ladder', () => {
    const spectrum = [
      'green',
      'teal',
      'blue',
      'indigo',
      'purple',
      'pink',
      'crimson',
      'orange',
      'gold',
      'prismatic',
    ]
    expect(TROPHY_TIER_ORDER).toEqual([...spectrum].reverse())
    for (const def of getTrophyDefinitionsFor(false)) {
      const expected =
        def.id === 'net-worth'
          ? spectrum.filter((t) => t !== 'teal')
          : def.id === 'charity-donated'
          ? ['green', 'blue', 'purple', 'crimson', 'gold', 'prismatic']
          : spectrum
      expect(def.milestones.map((m) => m.tier)).toEqual(expected)
    }
  })

  it('only measure known stats', () => {
    const keys = new Set<string>(TROPHY_STAT_KEYS)
    for (const def of TROPHY_DEFINITIONS)
      expect(keys.has(def.statKey)).toBe(true)
  })
})

describe('nightly ranks', () => {
  it('ranks exactly the seven ranked trophies', () => {
    expect(RANKED_TROPHY_DEFINITIONS.map((d) => d.id)).toEqual([
      'net-worth',
      'prediction-streak',
      'profitable-markets',
      'markets-created',
      'creator-traders',
      'liked-comments',
      'leagues',
    ])
  })

  it.each([
    [1, 'crown'],
    [2, 'mega'],
    [5, 'mega'],
    [6, 'super'],
    [25, 'super'],
    [26, null],
    [0, null],
    [-1, null],
    [1.5, null],
    [NaN, null],
    [null, null],
    [undefined, null],
  ] as const)('maps rank %s to %s', (rank, tier) => {
    expect(getTrophyRankTier(rank)).toBe(tier)
  })

  it('names ranks after the top milestone and orders held titles by rank then trophy order', () => {
    const rank = (trophyId: string, rank: number) => ({
      trophyId,
      rank,
      value: 500_000,
    })
    const held = getHeldTrophyTitles([
      rank('net-worth', 12),
      rank('unknown-trophy', 1),
      rank('total-trades', 1),
      rank('leagues', 5),
      rank('liked-comments', 3),
      rank('markets-created', 3),
      rank('prediction-streak', 1),
      rank('creator-traders', 26),
    ])
    expect(held.map((h) => h.title)).toEqual([
      '#1 Phoenix',
      'Mega Titan',
      'Mega Pundit',
      'Mega GOAT',
      'Super Whale',
    ])
    expect(held[4]).toEqual({
      definition: netWorth,
      tier: 'super',
      rank: 12,
      value: 500_000,
      title: 'Super Whale',
    })
    expect(getTrophyRankTitle(netWorth, 'mega')).toBe('Mega Whale')
    expect(getTrophyRankTitle(netWorth, 'crown')).toBe('#1 Whale')
    expect(
      getPeakRankTier([{ trophyId: netWorth.id, bestRank: 4 }], netWorth.id)
    ).toBe('mega')
    expect(getPeakRankTier([], netWorth.id)).toBeNull()
  })
})

describe('league level', () => {
  const leagues = getTrophyDefinition('leagues')!
  it.each([
    [0, 0, 0, 0, 0, 0, 'No Silver season yet'],
    [1, 0, 0, 0, 0, 1, 'Silver'],
    [2, 2, 0, 0, 0, 2, 'Gold'],
    [3, 3, 2, 0, 0, 3, 'Platinum'],
    [3, 3, 2, 1, 0, 4, 'Diamond'],
    [3, 3, 2, 1, 1, 5, '1 Masters season'],
    [8, 8, 8, 8, 8, 12, '8 Masters seasons'],
    [-1, -1, NaN, Infinity, -Infinity, 0, 'No Silver season yet'],
    [1, 1, 0, 0, -1, 2, 'Gold'],
  ] as const)(
    'maps season counts %s/%s/%s/%s/%s to level %s',
    (silver, gold, platinum, diamond, masters, expected, label) => {
      const level = getLeagueLevel({
        seasonsSilverOrHigher: silver,
        seasonsGoldOrHigher: gold,
        seasonsPlatinumOrHigher: platinum,
        seasonsDiamondOrHigher: diamond,
        seasonsMasters: masters,
      })
      expect(level).toBe(expected)
      expect(formatTrophyValue(leagues, level)).toBe(label)
    }
  )

  it('counts actual Masters seasons still needed from every lower division', () => {
    expect(formatLeagueRemaining(0, 1)).toBe('a Silver season')
    expect(formatLeagueRemaining(1, 2)).toBe('a Gold season')
    expect(formatLeagueRemaining(2, 3)).toBe('a Platinum season')
    expect(formatLeagueRemaining(3, 4)).toBe('a Diamond season')
    expect(formatLeagueRemaining(0, 5)).toBe('1 more Masters season')
    expect(formatLeagueRemaining(5, 7)).toBe('2 more Masters seasons')
  })
})

describe('progress', () => {
  it('shows known trophy stats while achievements are unavailable', () => {
    const trophies = {
      starter: { starterTrades: 0, starterMarkets: 0, starterDays: 0 },
      storedPeakNetWorth: 600_000,
      ranks: [{ trophyId: 'net-worth', rank: 1, value: 510_000 }],
    }
    const stats = getTrophyDisplayStats(undefined, trophies)
    expect(stats.netWorth).toBeUndefined()
    expect(stats.peakNetWorth).toBe(600_000)
    expect(stats.starterTrades).toBe(0)
    expect(stats.totalTradesCount).toBeUndefined()
    expect(
      getTrophyDisplayStats(undefined, {
        ...trophies,
        storedPeakNetWorth: null,
      }).peakNetWorth
    ).toBe(510_000)
    expect(
      getTrophyDisplayStats(undefined, undefined).peakNetWorth
    ).toBeUndefined()
  })

  it('uses the higher Net Worth peak as trophies and achievements refresh independently', () => {
    const achievements = {
      netWorth: 5_000,
      peakNetWorth: 499_999,
      totalTradesCount: 12,
    }
    const starter = { starterTrades: 3, starterMarkets: 2, starterDays: 1 }
    const trophies = {
      starter,
      storedPeakNetWorth: null,
      ranks: [{ trophyId: 'liked-comments', rank: 1, value: 900_000 }],
    }
    expect(getTrophyDisplayStats(achievements, trophies)).toEqual({
      ...achievements,
      ...starter,
    })

    const refreshedTrophies = {
      ...trophies,
      ranks: [
        ...trophies.ranks,
        { trophyId: 'net-worth', rank: 1, value: 500_000 },
      ],
    }
    expect(
      getTrophyDisplayStats(achievements, {
        ...trophies,
        storedPeakNetWorth: 505_000,
      }).peakNetWorth
    ).toBe(505_000)
    const stats = getTrophyDisplayStats(achievements, refreshedTrophies)
    expect(stats.peakNetWorth).toBe(500_000)
    expect(
      getClaimableMilestones(stats, [], [netWorth]).map((m) => m.milestone.id)
    ).toEqual(['minnow', 'pufferfish'])

    const refreshedAchievements = { ...achievements, peakNetWorth: 510_000 }
    expect(
      getTrophyDisplayStats(refreshedAchievements, refreshedTrophies)
        .peakNetWorth
    ).toBe(510_000)
  })

  it('treats missing and non-finite stats as zero', () => {
    expect(getTrophyStatValue(netWorth, {})).toBe(0)
    expect(getTrophyStatValue(netWorth, { netWorth: NaN })).toBe(0)
    expect(getTrophyStatValue(netWorth, { netWorth: Infinity })).toBe(0)
  })

  it('finds the highest and next milestone at a threshold boundary', () => {
    expect(getHighestMilestone(netWorth, 2_499)).toBeNull()
    expect(getNextMilestone(netWorth, 2_499)?.id).toBe('minnow')
    expect(getHighestMilestone(netWorth, 2_500)?.id).toBe('minnow')
    expect(getNextMilestone(netWorth, 2_500)?.id).toBe('pufferfish')
    expect(getHighestMilestone(netWorth, 1e12)?.id).toBe('whale')
    expect(getNextMilestone(netWorth, 1e12)).toBeNull()
  })

  it('counts the zero-threshold milestone as reached for every account', () => {
    // Account age "Newcomer" has threshold 0.
    expect(countReachedMilestones({})).toBe(1)
  })
})

describe('claims', () => {
  it('claims the requested milestone and every lower one once reached', () => {
    const toClaim = getMilestonesToClaim(netWorth, 'swordfish', 30_000)
    expect(toClaim?.map((m) => m.id)).toEqual([
      'minnow',
      'pufferfish',
      'goldfish',
      'swordfish',
    ])
  })

  it('refuses a milestone that has not been reached, or does not exist', () => {
    expect(getMilestonesToClaim(netWorth, 'shark', 99_999)).toBeNull()
    expect(getMilestonesToClaim(netWorth, 'not-a-milestone', 1e12)).toBeNull()
  })

  it('ignores claims of trophies or milestones that are no longer defined', () => {
    const claims = [
      claim('net-worth', 'minnow'),
      claim('net-worth', 'minnow'),
      claim('net-worth', 'retired-milestone'),
      claim('retired-trophy', 'minnow'),
    ]
    expect(countClaimedMilestones(claims)).toBe(1)
    expect(getHighestClaimedMilestone(netWorth, claims)?.id).toBe('minnow')
  })

  it('takes the highest claimed milestone by threshold, not by order', () => {
    const claims = [claim('net-worth', 'shark'), claim('net-worth', 'minnow')]
    expect(getHighestClaimedMilestone(netWorth, claims)?.id).toBe('shark')
  })

  it('counts reached milestones that are not claimed yet', () => {
    const stats = { netWorth: 30_000 }
    // Four Net Worth milestones plus Newcomer are reached.
    expect(countUnclaimedReachedMilestones(stats, [])).toBe(5)
    expect(
      countUnclaimedReachedMilestones(stats, [
        claim('net-worth', 'minnow'),
        claim('account-age', 'newcomer'),
      ])
    ).toBe(3)
  })

  it('counts a claimed milestone as earned after its stat drops', () => {
    const stats = { netWorth: 30_000 }
    expect(countEarnedMilestones(stats, [])).toBe(5)
    // Lucky (10 profitable markets) stays earned once claimed.
    expect(
      countEarnedMilestones(stats, [claim('profitable-markets', 'lucky')])
    ).toBe(6)
    expect(countEarnedMilestones(stats, [claim('net-worth', 'minnow')])).toBe(5)
  })
})

describe('claimable milestones', () => {
  it('returns no pairs when no threshold has been reached', () => {
    expect(getClaimableMilestones({ netWorth: 2_499 }, [], [netWorth])).toEqual(
      []
    )
  })

  it('returns the reached, unclaimed pairs even with retired claim ids', () => {
    const stats = { netWorth: 30_000 }
    const claims = [
      claim(netWorth.id, 'minnow'),
      claim(netWorth.id, 'retired-milestone'),
      claim('retired-trophy', 'goldfish'),
    ]
    const ready = getClaimableMilestones(stats, claims, [netWorth])
    expect(ready).toEqual([
      { definition: netWorth, milestone: netWorth.milestones[1] },
      { definition: netWorth, milestone: netWorth.milestones[2] },
      { definition: netWorth, milestone: netWorth.milestones[3] },
    ])
    expect(ready).toHaveLength(
      countUnclaimedReachedMilestones(stats, claims, [netWorth])
    )
  })

  it.each([false, true])(
    'matches the badge count with starter eligibility %s',
    (starter) => {
      const stats = { starterTrades: 3, netWorth: 2_500 }
      const claims = [claim('starter-trades', 'first-trade')]
      const defs = getTrophyDefinitionsFor(starter)
      const ready = getClaimableMilestones(stats, claims, defs)
      expect(ready.map(({ milestone }) => milestone.id)).toEqual([
        ...(starter ? ['hat-trick'] : []),
        'minnow',
        'newcomer',
      ])
      expect(ready).toHaveLength(
        countUnclaimedReachedMilestones(stats, claims, defs)
      )
    }
  )
})

describe('trophy unlock toasts', () => {
  const stats = { netWorth: 30_000, totalTradesCount: 100 }
  const ready = getClaimableMilestones(
    stats,
    [],
    getTrophyDefinitionsFor(false)
  )

  it('selects the highest new milestone per trophy regardless of input order', () => {
    const { milestones, moreCount } = selectTrophyUnlockToasts(
      [...ready].reverse(),
      new Set()
    )
    expect(milestones.map(({ milestone }) => milestone.id)).toEqual([
      'newcomer',
      'regular',
      'swordfish',
    ])
    expect(moreCount).toBe(0)
  })

  it('skips seen keys before choosing the highest milestone', () => {
    const seen = new Set([
      'net-worth/swordfish',
      'total-trades/rookie',
      'total-trades/regular',
      'total-trades/dabbler',
    ])
    const { milestones, newKeys, moreCount } = selectTrophyUnlockToasts(
      ready,
      seen
    )
    expect(milestones.map(({ milestone }) => milestone.id)).toEqual([
      'goldfish',
      'newcomer',
    ])
    expect(newKeys).toEqual([
      'net-worth/minnow',
      'net-worth/pufferfish',
      'net-worth/goldfish',
      'account-age/newcomer',
    ])
    expect(moreCount).toBe(0)
  })

  it('caps individual toasts at three and counts remaining trophies once each', () => {
    const many = getClaimableMilestones(
      { ...stats, starterTrades: 3, starterMarkets: 10 },
      [],
      getTrophyDefinitionsFor(true)
    )
    const { milestones, moreCount, newKeys } = selectTrophyUnlockToasts(
      many,
      new Set()
    )
    expect(milestones.map(({ milestone }) => milestone.id)).toEqual([
      'hat-trick',
      'explorer',
      'swordfish',
    ])
    expect(moreCount).toBe(2)
    expect(newKeys).toHaveLength(many.length)
    expect(selectTrophyUnlockToasts(many, new Set(newKeys))).toEqual({
      milestones: [],
      moreCount: 0,
      newKeys: [],
    })
  })
})

describe('account anniversaries', () => {
  it('match Postgres interval addition, in UTC', () => {
    const at = (s: string) => new Date(s).valueOf()
    expect(getAccountAnniversaryTime(at('2023-03-01T00:00:00Z'), 1)).toBe(
      at('2024-03-01T00:00:00Z')
    )
    expect(getAccountAnniversaryTime(at('2024-01-31T12:00:00Z'), 1 / 12)).toBe(
      at('2024-02-29T12:00:00Z')
    )
    expect(getAccountAnniversaryTime(at('2023-01-31T12:00:00Z'), 1 / 4)).toBe(
      at('2023-04-30T12:00:00Z')
    )
    expect(getAccountAnniversaryTime(at('2024-08-31T12:00:00Z'), 3 / 2)).toBe(
      at('2026-02-28T12:00:00Z')
    )
    // A Feb 29 signup turns one on Feb 28, and four on Feb 29.
    expect(getAccountAnniversaryTime(at('2024-02-29T12:00:00Z'), 1)).toBe(
      at('2025-02-28T12:00:00Z')
    )
    expect(getAccountAnniversaryTime(at('2024-02-29T12:00:00Z'), 4)).toBe(
      at('2028-02-29T12:00:00Z')
    )
    expect(getAccountAnniversaryTime(at('2021-12-31T23:59:59.5Z'), 0)).toBe(
      at('2021-12-31T23:59:59.5Z')
    )
  })
})

describe('showcase pins', () => {
  const claimsOf = (n: number) =>
    TROPHY_DEFINITIONS.flatMap((d) =>
      d.milestones.map((m) => claim(d.id, m.id))
    ).slice(0, n)

  it('unlocks pin slots at 0, 10 and 25 claimed milestones', () => {
    expect(getMaxShowcasePins(0)).toBe(1)
    expect(getMaxShowcasePins(9)).toBe(1)
    expect(getMaxShowcasePins(10)).toBe(2)
    expect(getMaxShowcasePins(24)).toBe(2)
    expect(getMaxShowcasePins(25)).toBe(3)
    expect(getMaxShowcasePins(10_000)).toBe(MAX_SHOWCASE_PINS)
  })

  it('round-trips trophy pin ids', () => {
    expect(getTrophyIdFromPin(getTrophyPinId('net-worth'))).toBe('net-worth')
    expect(getTrophyIdFromPin(LEAGUE_SHOWCASE_PIN)).toBeNull()
  })

  it('accepts claimed trophies and the league badge within the slot limit', () => {
    const claims = claimsOf(25)
    const pinned = getTrophyPinId(claims[0].trophyId)
    expect(getShowcasePinsError([], [])).toBeNull()
    expect(getShowcasePinsError([pinned], claims)).toBeNull()
    expect(
      getShowcasePinsError([pinned, LEAGUE_SHOWCASE_PIN], claims)
    ).toBeNull()
  })

  it('rejects unclaimed, unknown, duplicate and excess pins', () => {
    const one = [claim('net-worth', 'minnow')]
    expect(
      getShowcasePinsError([getTrophyPinId('liked-comments')], one)
    ).not.toBeNull()
    expect(getShowcasePinsError(['trophy-nope'], one)).not.toBeNull()
    expect(getShowcasePinsError(['something-else'], one)).not.toBeNull()
    expect(
      getShowcasePinsError(
        [getTrophyPinId('net-worth'), getTrophyPinId('net-worth')],
        one
      )
    ).not.toBeNull()
    // One claim unlocks one slot.
    expect(
      getShowcasePinsError(
        [getTrophyPinId('net-worth'), LEAGUE_SHOWCASE_PIN],
        one
      )
    ).not.toBeNull()
  })
})

describe('Net Worth status', () => {
  const claims = [claim('net-worth', 'orca')]
  it.each([
    [510_000, 'whale', null],
    [250_000, 'orca', null],
    [5_000, 'pufferfish', 'orca'],
    [2_499, null, 'orca'],
  ] as const)(
    'shows the current tier at %s and keeps a higher best as history',
    (value, current, best) => {
      const stats = { netWorth: value, peakNetWorth: 251_000 }
      const status = getNetWorthStatus(stats, claims)
      expect(status.current?.id ?? null).toBe(current)
      expect(status.previousBest?.id ?? null).toBe(best)
      expect(countEarnedMilestones(stats, claims, [netWorth])).toBe(
        countReachedMilestones(stats, [netWorth])
      )
    }
  )

  it('keeps the best from the stored peak even if only Minnow was claimed', () => {
    const status = getNetWorthStatus({ netWorth: 0, peakNetWorth: 250_000 }, [
      claim('net-worth', 'minnow'),
    ])
    expect(status.current).toBeNull()
    expect(status.previousBest?.id).toBe('orca')
  })
})

describe('formatTrophyValue', () => {
  it('shows whole numbers, rounded down', () => {
    expect(formatTrophyValue(netWorth, 360.867)).toBe('360')
    expect(formatTrophyValue(netWorth, 360_867)).toBe('360K')
    expect(formatTrophyValue(netWorth, 2_500_000)).toBe('2.5M')
    expect(formatTrophyValue(netWorth, 12_000)).toBe('12K')
    const charity = getTrophyDefinition('charity-donated')!
    expect(formatTrophyValue(charity, 12.5)).toBe('$12')
    const comments = getTrophyDefinition('liked-comments')!
    expect(formatTrophyValue(comments, 1234)).toBe('1,234')
  })

  it('never shows a threshold not yet reached, or 0 still to go', () => {
    expect(formatTrophyValue(netWorth, 9_999.75)).toBe('9.9K')
    expect(formatTrophyValue(netWorth, 0.25, 'up')).toBe('1')
    const charity = getTrophyDefinition('charity-donated')!
    expect(formatTrophyValue(charity, 9.75)).toBe('$9')
    expect(formatTrophyValue(charity, 0.25, 'up')).toBe('$1')
  })
})

describe('getting started trophies', () => {
  const starterDefs = TROPHY_DEFINITIONS.filter(isStarterTrophy)

  it.each([
    ['restricted', 0],
    ['reduced', 0.2],
    ['free', 1],
    ['basic', 1],
    ['plus', 1],
    ['premium', 1],
  ] as const)('gives the %s tier a %s× trophy reward', (tier, multiplier) => {
    expect(getTrophyRewardMultiplier(tier)).toBe(multiplier)
  })

  it('list every starter milestone and Newcomer for onboarding, each with a prize', () => {
    expect(starterDefs.length).toBeGreaterThan(0)
    for (const def of TROPHY_DEFINITIONS) {
      for (const m of def.milestones) {
        const onboarding =
          isStarterTrophy(def) ||
          (def.id === 'account-age' && m.id === 'newcomer')
        expect(
          ONBOARDING_MILESTONES.some(
            ({ definition, milestone }) =>
              definition.id === def.id && milestone.id === m.id
          )
        ).toBe(onboarding)
        if (onboarding) {
          const prize = totalPrizes([
            getMilestonePrize(def.id, m, { isStarterAccount: true }),
          ])
          expect([def.id, m.id, isEmptyPrizeTotal(prize)]).toEqual([
            def.id,
            m.id,
            false,
          ])
        }
      }
    }
  })

  it('measure only the live starter stats', () => {
    const keys = new Set<string>(STARTER_STAT_KEYS)
    for (const def of TROPHY_DEFINITIONS) {
      expect(keys.has(def.statKey)).toBe(isStarterTrophy(def))
    }
  })

  it('are only for accounts created at or after the start time', () => {
    const start = Date.UTC(2026, 11, 1)
    expect(isStarterTrophyAccount(start - 1, start)).toBe(false)
    expect(isStarterTrophyAccount(start, start)).toBe(true)
    expect(isStarterTrophyAccount(start + 1, start)).toBe(true)
    expect(isStarterTrophyAccount(start, null)).toBe(false)
    expect(isStarterTrophyAccount(NaN, start)).toBe(false)
  })

  it('are left out for other accounts', () => {
    expect(getTrophyDefinitionsFor(false).some(isStarterTrophy)).toBe(false)
    expect(getTrophyDefinitionsFor(true)).toEqual(TROPHY_DEFINITIONS)
  })

  it('claiming a higher starter milestone pays the lower ones too', () => {
    const trades = getTrophyDefinition('starter-trades')!
    const hatTrick = trades.milestones.find((m) => m.id === 'hat-trick')!
    const account = (tier: 'free' | 'reduced'): TrophyPrizeAccount => ({
      isStarterAccount: true,
      standing: getTrophyPrizeStanding(tier),
    })
    expect(
      getMilestonesToClaim(trades, 'hat-trick', 3)?.map((m) => m.id)
    ).toEqual(['first-trade', 'hat-trick'])
    // M50 + M50.
    expect(getTrophyClaimPrize(trades, hatTrick, [], account('free'))).toEqual({
      mana: 100,
      freezes: 0,
      membership: [],
    })
    // First Trade is paid already; a bonus-blocked account gets 0.2x.
    expect(
      getTrophyClaimPrize(
        trades,
        hatTrick,
        [claim(trades.id, 'first-trade')],
        account('reduced')
      )
    ).toEqual({ mana: 10, freezes: 0, membership: [] })
  })
})

describe('trophy claim prizes', () => {
  const account = (
    tier: (typeof EFFECTIVE_TIER_ORDER)[number],
    isStarterAccount = false
  ): TrophyPrizeAccount => ({
    isStarterAccount,
    standing: getTrophyPrizeStanding(tier),
  })
  const trades = getTrophyDefinition('total-trades')!
  const milestone = (id: string) => trades.milestones.find((m) => m.id === id)!

  it('pays the colour schedule for a claim and every unpaid lower milestone', () => {
    // green and teal: a freeze each. blue: a freeze and a day of Plus.
    // indigo: M50 and two days of Plus.
    expect(
      getTrophyClaimPrize(trades, milestone('enthusiast'), [], account('free'))
    ).toEqual({
      mana: 50,
      freezes: 3,
      membership: [
        { tier: 'basic', days: 1 },
        { tier: 'basic', days: 2 },
      ],
    })
  })

  it('pays each milestone once: paid ones are left out of a later claim', () => {
    const rewarded = [
      claim(trades.id, 'rookie'),
      claim(trades.id, 'regular'),
      // Another trophy's payment doesn't count.
      claim('liked-comments', 'chatterbox'),
    ]
    expect(
      getTrophyClaimPrize(
        trades,
        milestone('enthusiast'),
        rewarded,
        account('free')
      )
    ).toEqual({
      mana: 50,
      freezes: 1,
      membership: [{ tier: 'basic', days: 2 }],
    })
    const all = trades.milestones.map((m) => claim(trades.id, m.id))
    for (const m of trades.milestones) {
      expect(getTrophyClaimPrize(trades, m, all, account('free'))).toEqual(
        EMPTY_PRIZE_TOTAL
      )
    }
  })

  it('never pays for milestones above the one claimed', () => {
    expect(
      getTrophyClaimPrize(trades, milestone('rookie'), [], account('free'))
    ).toEqual({ mana: 0, freezes: 1, membership: [] })
  })

  it('cuts the prize to the standing of the account', () => {
    const top = getTopOf(trades)
    const full = getTrophyClaimPrize(trades, top, [], account('free'))
    expect(full.mana).toBe(50 + 100 + 150 + 250 + 350 + 500 + 1_000)
    expect(full.freezes).toBe(3)
    expect(full.membership).toHaveLength(8)
    // Members get no more than everyone else.
    for (const tier of ['basic', 'plus', 'premium'] as const) {
      expect(getTrophyClaimPrize(trades, top, [], account(tier))).toEqual(full)
    }
    // Bonus-blocked: a fifth of the mana, the freezes, no membership days.
    expect(getTrophyClaimPrize(trades, top, [], account('reduced'))).toEqual({
      mana: full.mana / 5,
      freezes: 3,
      membership: [],
    })
    // Flagged: nothing.
    expect(getTrophyClaimPrize(trades, top, [], account('restricted'))).toEqual(
      EMPTY_PRIZE_TOTAL
    )
  })

  it('leaves out milestones that would pay the account nothing, so they stay unpaid', () => {
    // Every Prediction Streak milestone has a freeze, which a bonus-blocked
    // account still gets.
    const streak = getTrophyDefinition('prediction-streak')!
    const ids = (tier: 'free' | 'reduced' | 'restricted') =>
      getMilestonePrizesFor(streak, streak.milestones, account(tier)).map(
        (p) => p.milestone.id
      )
    expect(ids('free')).toEqual(streak.milestones.map((m) => m.id))
    expect(ids('reduced')).toEqual(streak.milestones.map((m) => m.id))
    expect(ids('restricted')).toEqual([])
    // In the Groove pays Pro days only.
    const starter = getTrophyDefinition('starter-trades')!
    const groove = starter.milestones.filter((m) => m.id === 'in-the-groove')
    expect(groove).toHaveLength(1)
    expect(
      getMilestonePrizesFor(starter, groove, account('reduced', true))
    ).toEqual([])
    expect(
      getMilestonePrizesFor(starter, groove, account('free', true))
    ).toEqual([
      {
        milestone: groove[0],
        base: { mana: 0, freezes: 0, membership: [{ tier: 'plus', days: 3 }] },
        prize: { mana: 0, freezes: 0, membership: [{ tier: 'plus', days: 3 }] },
      },
    ])
  })

  it('pays Newcomer as mana to a new account and as a freeze to the rest', () => {
    const age = getTrophyDefinition('account-age')!
    const newcomer = age.milestones[0]
    expect(newcomer.id).toBe('newcomer')
    expect(
      getTrophyClaimPrize(age, newcomer, [], account('free', true))
    ).toEqual({ mana: 50, freezes: 0, membership: [] })
    expect(
      getTrophyClaimPrize(age, newcomer, [], account('free', false))
    ).toEqual({ mana: 0, freezes: 1, membership: [] })
  })

  it('collects exactly the milestones a Net Worth claim records', () => {
    const toClaim = getMilestonesToClaim(netWorth, 'goldfish', 10_000)!
    expect(toClaim.map((m) => m.id)).toEqual([
      'minnow',
      'pufferfish',
      'goldfish',
    ])
    const prize = getTrophyClaimPrize(
      netWorth,
      toClaim[toClaim.length - 1],
      [],
      account('free')
    )
    expect(
      getMilestonePrizesFor(netWorth, toClaim, account('free')).map(
        (p) => p.prize
      )
    ).toEqual([
      { mana: 0, freezes: 1, membership: [] },
      { mana: 0, freezes: 1, membership: [{ tier: 'basic', days: 1 }] },
      { mana: 50, freezes: 0, membership: [{ tier: 'basic', days: 2 }] },
    ])
    expect(prize).toEqual({
      mana: 50,
      freezes: 2,
      membership: [
        { tier: 'basic', days: 1 },
        { tier: 'basic', days: 2 },
      ],
    })
  })

  // The server pays milestone by milestone and the page shows the sum. Both
  // must be the prize table's total, cut once for standing, with no mana
  // lost or made by rounding.
  it('adds up to the prize table for every trophy, account age and standing', () => {
    for (const def of TROPHY_DEFINITIONS) {
      for (const tier of EFFECTIVE_TIER_ORDER) {
        for (const isStarterAccount of [true, false]) {
          const acct = account(tier, isStarterAccount)
          const expected = applyPrizeStanding(
            totalPrizes(
              def.milestones.map((m) =>
                getMilestonePrize(def.id, m, { isStarterAccount })
              )
            ),
            acct.standing
          )
          const prize = getTrophyClaimPrize(def, getTopOf(def), [], acct)
          expect([def.id, tier, prize]).toEqual([def.id, tier, expected])
          expect(Number.isFinite(prize.mana) && prize.mana >= 0).toBe(true)
          expect(Number.isInteger(prize.freezes) && prize.freezes >= 0).toBe(
            true
          )
          // Claiming rung by rung pays the same as claiming the top at once.
          const paid: TrophyClaim[] = []
          let mana = 0
          let freezes = 0
          let days = 0
          for (const m of def.milestones) {
            const step = getTrophyClaimPrize(def, m, paid, acct)
            mana += step.mana
            freezes += step.freezes
            days += step.membership.reduce((sum, p) => sum + p.days, 0)
            paid.push(
              ...def.milestones
                .filter((lower) => lower.threshold <= m.threshold)
                .map((lower) => claim(def.id, lower.id))
            )
          }
          expect(Math.round(mana * 100) / 100).toBe(expected.mana)
          expect(freezes).toBe(expected.freezes)
          expect(days).toBe(
            expected.membership.reduce((sum, p) => sum + p.days, 0)
          )
        }
      }
    }
  })
})

describe('rank title prizes', () => {
  it('pays Super to the top 25 and Mega as well to the top 5', () => {
    expect(getRankPrizeTiers(1)).toEqual(['mega', 'super'])
    expect(getRankPrizeTiers(5)).toEqual(['mega', 'super'])
    expect(getRankPrizeTiers(6)).toEqual(['super'])
    expect(getRankPrizeTiers(25)).toEqual(['super'])
    for (const rank of [26, 0, -1, 1.5, NaN, Infinity, null, undefined]) {
      expect(getRankPrizeTiers(rank)).toEqual([])
    }
  })

  it('keys each prize under an id no milestone can have', () => {
    for (const tier of ['super', 'mega'] as const) {
      const id = getRankPrizeRewardId(tier)
      expect(id).toBe(`rank:${tier}`)
      expect(id).not.toMatch(/^[a-z0-9-]+$/)
      expect(isRankPrizeRewardId(id)).toBe(true)
      expect(getRankPrizeTierFromRewardId(id)).toBe(tier)
    }
    expect(getRankPrizeTierFromRewardId('rank:crown')).toBeNull()
  })

  it('applies account standing', () => {
    for (const tier of ['super', 'mega'] as const) {
      const full = totalPrizes([RANK_TIER_PRIZES[tier]])
      expect(isEmptyPrizeTotal(full)).toBe(false)
      expect(getRankTierPrize(tier, getTrophyPrizeStanding('free'))).toEqual(
        full
      )
      expect(
        getRankTierPrize(tier, getTrophyPrizeStanding('restricted'))
      ).toEqual(EMPTY_PRIZE_TOTAL)
      expect(
        getRankTierPrize(tier, getTrophyPrizeStanding('reduced')).membership
      ).toEqual([])
    }
  })
})

describe('membership prize results', () => {
  const part = { tier: 'basic' as const, days: 3, grantedDays: 3 }

  it('say what became of the days in a few words', () => {
    expect(formatMembershipResult({ ...part, outcome: 'started' })).toBe(
      '3 days of Plus: started'
    )
    expect(formatMembershipResult({ ...part, outcome: 'banked' })).toBe(
      '3 days of Plus: saved for later'
    )
    expect(
      formatMembershipResult({ ...part, grantedDays: 0, outcome: 'capped' })
    ).toBe('3 days of Plus: 30-day limit reached')
    expect(
      formatMembershipResult({ ...part, grantedDays: 0, outcome: 'pending' })
    ).toBe('3 days of Plus: on its way')
    expect(formatMembershipResult({ ...part, outcome: 'duplicate' })).toBe(
      '3 days of Plus: already added'
    )
    expect(
      formatMembershipResult({
        tier: 'paid-tier',
        days: 7,
        grantedDays: 0,
        outcome: 'skipped',
      })
    ).toBe('7 days of your membership: needs a paid membership')
    expect(
      formatMembershipResult({
        tier: 'plus',
        days: 1,
        grantedDays: 1,
        outcome: 'started',
      })
    ).toBe('1 day of Pro: started')
  })

  it('say when the holding cap cut a grant short, rounding down', () => {
    expect(
      formatMembershipResult({ ...part, grantedDays: 1.96, outcome: 'started' })
    ).toBe('3 days of Plus: started (1.9 days, 30-day limit)')
    expect(
      formatMembershipResult({ ...part, grantedDays: 1, outcome: 'banked' })
    ).toBe('3 days of Plus: saved for later (1 day, 30-day limit)')
    expect(
      formatMembershipResult({ ...part, grantedDays: 0.01, outcome: 'started' })
    ).toBe('3 days of Plus: started (under 0.1 days, 30-day limit)')
    expect(
      formatMembershipResult({ ...part, grantedDays: NaN, outcome: 'started' })
    ).toBe('3 days of Plus: started')
  })
})

const getTopOf = (def: (typeof TROPHY_DEFINITIONS)[number]) =>
  def.milestones[def.milestones.length - 1]

describe('onboarding milestones', () => {
  const zero = { starterTrades: 0, starterMarkets: 0, starterDays: 0 }
  const all = { starterTrades: 25, starterMarkets: 10, starterDays: 7 }
  const newcomer = claim('account-age', 'newcomer')

  it('starts with Newcomer and lists only unclaimed reached milestones in definition order', () => {
    const ids = (stats: typeof zero | null, claims: TrophyClaim[]) =>
      getClaimableOnboardingMilestones(stats, claims).map((m) => m.milestone.id)
    expect(ids(null, [])).toEqual([])
    expect(ids(zero, [])).toEqual(['newcomer'])
    const stats = { starterTrades: 3, starterMarkets: 3, starterDays: 2 }
    expect(ids(stats, [])).toEqual([
      'newcomer',
      'first-trade',
      'hat-trick',
      'curious',
      'back-again',
    ])
    expect(
      ids(stats, [newcomer, claim('starter-trades', 'first-trade')])
    ).toEqual(['hat-trick', 'curious', 'back-again'])
  })

  it('selects the smallest remaining gap, breaking ties in definition order', () => {
    expect(getNextOnboardingMilestone(zero, [newcomer])?.milestone.id).toBe(
      'first-trade'
    )
    const stats = { starterTrades: 1, starterMarkets: 2, starterDays: 1 }
    expect(getNextOnboardingMilestone(stats, [])?.milestone.id).toBe('curious')
    expect(
      getNextOnboardingMilestone({ ...stats, starterMarkets: 1 }, [])?.milestone
        .id
    ).toBe('back-again')
  })

  it('skips earned milestones even after a stat drops, and finishes when all are reached', () => {
    const claims = ONBOARDING_MILESTONES.map(({ definition, milestone }) =>
      claim(definition.id, milestone.id)
    )
    expect(getClaimableOnboardingMilestones(all, claims)).toEqual([])
    expect(getNextOnboardingMilestone(zero, claims)).toBeNull()
    expect(getNextOnboardingMilestone(all, [])).toBeNull()
    expect(getNextOnboardingMilestone(null, [])).toBeNull()
  })
})
