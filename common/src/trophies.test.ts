import {
  LEAGUE_SHOWCASE_PIN,
  MAX_SHOWCASE_PINS,
  ONBOARDING_MILESTONES,
  STARTER_STAT_KEYS,
  TROPHY_DEFINITIONS,
  TROPHY_STAT_KEYS,
  RANKED_TROPHY_DEFINITIONS,
  formatLeagueRemaining,
  getLeagueLevel,
  getHeldTrophyTitles,
  getPeakRankTier,
  getTrophyRankTier,
  getTrophyRankTitle,
  TrophyClaim,
  countClaimedMilestones,
  getRewardManaTotal,
  getTrophyClaimReward,
  getTrophyRewardMultiplier,
  getTrophyDefinitionsFor,
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

  it('has one kept milestone per colour on every lifetime ladder', () => {
    for (const def of TROPHY_DEFINITIONS.filter((d) => !isStarterTrophy(d))) {
      expect(def.milestones.map((m) => m.tier)).toEqual([
        'green',
        'blue',
        'purple',
        'crimson',
        'gold',
        'prismatic',
      ])
    }
  })

  it('only measure known stats', () => {
    const keys = new Set<string>(TROPHY_STAT_KEYS)
    for (const def of TROPHY_DEFINITIONS)
      expect(keys.has(def.statKey)).toBe(true)
  })
})

describe('nightly ranks', () => {
  it('defines a rank note for exactly the seven ranked trophies', () => {
    expect(RANKED_TROPHY_DEFINITIONS.map((d) => d.id)).toEqual([
      'net-worth',
      'prediction-streak',
      'profitable-markets',
      'markets-created',
      'creator-traders',
      'liked-comments',
      'leagues',
    ])
    for (const def of RANKED_TROPHY_DEFINITIONS)
      expect(def.rankNote?.trim()).toBeTruthy()
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
    [0, 0, 0, 0, 0, 'No Gold season yet'],
    [2, 0, 0, 0, 1, 'Gold'],
    [3, 2, 0, 0, 2, 'Platinum'],
    [3, 2, 1, 0, 3, 'Diamond'],
    [3, 2, 1, 1, 4, '1 Masters season'],
    [8, 8, 8, 8, 11, '8 Masters seasons'],
    [-1, NaN, Infinity, -Infinity, 0, 'No Gold season yet'],
    [1, 0, 0, -1, 1, 'Gold'],
  ] as const)(
    'maps season counts %s/%s/%s/%s to level %s',
    (gold, platinum, diamond, masters, expected, label) => {
      const level = getLeagueLevel({
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
    expect(formatLeagueRemaining(0, 1)).toBe('a Gold season')
    expect(formatLeagueRemaining(1, 2)).toBe('a Platinum season')
    expect(formatLeagueRemaining(2, 3)).toBe('a Diamond season')
    expect(formatLeagueRemaining(0, 4)).toBe('1 more Masters season')
    expect(formatLeagueRemaining(4, 6)).toBe('2 more Masters seasons')
  })
})

describe('progress', () => {
  it('treats missing and non-finite stats as zero', () => {
    expect(getTrophyStatValue(netWorth, {})).toBe(0)
    expect(getTrophyStatValue(netWorth, { peakNetWorth: NaN })).toBe(0)
    expect(getTrophyStatValue(netWorth, { peakNetWorth: Infinity })).toBe(0)
  })

  it('finds the highest and next milestone at a threshold boundary', () => {
    expect(getHighestMilestone(netWorth, 2_499)).toBeNull()
    expect(getNextMilestone(netWorth, 2_499)?.id).toBe('minnow')
    expect(getHighestMilestone(netWorth, 2_500)?.id).toBe('minnow')
    expect(getNextMilestone(netWorth, 2_500)?.id).toBe('goldfish')
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
    const stats = { peakNetWorth: 30_000 }
    // Three Net Worth milestones plus Newcomer are reached.
    expect(countUnclaimedReachedMilestones(stats, [])).toBe(4)
    expect(
      countUnclaimedReachedMilestones(stats, [
        claim('net-worth', 'minnow'),
        claim('account-age', 'newcomer'),
      ])
    ).toBe(2)
  })

  it('counts a claimed milestone as earned after its stat drops', () => {
    const stats = { peakNetWorth: 30_000 }
    expect(countEarnedMilestones(stats, [])).toBe(4)
    // Lucky (10 profitable markets) stays earned once claimed.
    expect(
      countEarnedMilestones(stats, [claim('profitable-markets', 'lucky')])
    ).toBe(5)
    expect(countEarnedMilestones(stats, [claim('net-worth', 'minnow')])).toBe(4)
  })
})

describe('claimable milestones', () => {
  it('returns no pairs when no threshold has been reached', () => {
    expect(
      getClaimableMilestones({ peakNetWorth: 2_499 }, [], [netWorth])
    ).toEqual([])
  })

  it('returns the reached, unclaimed pairs even with retired claim ids', () => {
    const stats = { peakNetWorth: 30_000 }
    const claims = [
      claim(netWorth.id, 'minnow'),
      claim(netWorth.id, 'retired-milestone'),
      claim('retired-trophy', 'goldfish'),
    ]
    const ready = getClaimableMilestones(stats, claims, [netWorth])
    expect(ready).toEqual([
      { definition: netWorth, milestone: netWorth.milestones[1] },
      { definition: netWorth, milestone: netWorth.milestones[2] },
    ])
    expect(ready).toHaveLength(
      countUnclaimedReachedMilestones(stats, claims, [netWorth])
    )
  })

  it.each([false, true])(
    'matches the badge count with starter eligibility %s',
    (starter) => {
      const stats = { starterTrades: 3, peakNetWorth: 2_500 }
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
  const stats = { peakNetWorth: 30_000, totalTradesCount: 100 }
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

  it('pay a positive finite reward on every starter milestone and Newcomer', () => {
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
          expect(Number.isFinite(m.rewardMana)).toBe(true)
          expect(m.rewardMana).toBeGreaterThan(0)
        } else {
          expect(m.rewardMana).toBeUndefined()
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

  it('total rewards, skipping missing, negative and non-finite amounts', () => {
    const base = starterDefs[0].milestones[0]
    expect(
      getRewardManaTotal([
        { ...base, rewardMana: 50 },
        { ...base, rewardMana: 100 },
        { ...base, rewardMana: undefined },
        { ...base, rewardMana: -10 },
        { ...base, rewardMana: NaN },
        { ...base, rewardMana: Infinity },
      ])
    ).toBe(150)
  })

  it('claiming a higher starter milestone pays the lower ones too', () => {
    const trades = getTrophyDefinition('starter-trades')!
    const toClaim = getMilestonesToClaim(trades, 'getting-going', 10)
    expect(toClaim?.map((m) => m.id)).toEqual([
      'first-trade',
      'hat-trick',
      'getting-going',
    ])
    expect(getRewardManaTotal(toClaim ?? [])).toBe(200)
    expect(
      getTrophyClaimReward(
        trades,
        trades.milestones[2],
        [claim(trades.id, 'first-trade')],
        getTrophyRewardMultiplier('reduced')
      )
    ).toBe(30)
  })
})

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
