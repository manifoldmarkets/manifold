import {
  LEAGUE_SHOWCASE_PIN,
  MAX_SHOWCASE_PINS,
  TROPHY_DEFINITIONS,
  TROPHY_STAT_KEYS,
  TrophyClaim,
  countClaimedMilestones,
  countEarnedMilestones,
  countReachedMilestones,
  getAccountAnniversaryTime,
  countUnclaimedReachedMilestones,
  formatTrophyValue,
  getHighestClaimedMilestone,
  getHighestMilestone,
  getMaxShowcasePins,
  getMilestonesToClaim,
  getNextMilestone,
  getShowcasePinsError,
  getTrophyDefinition,
  getTrophyIdFromPin,
  getTrophyPinId,
  getTrophyStatValue,
} from './trophies'

const claim = (trophyId: string, milestoneId: string): TrophyClaim => ({
  trophyId,
  milestoneId,
  claimedTime: 0,
})

const volume = getTrophyDefinition('trading-volume')!

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

  it('only measure known stats', () => {
    const keys = new Set<string>(TROPHY_STAT_KEYS)
    for (const def of TROPHY_DEFINITIONS)
      expect(keys.has(def.statKey)).toBe(true)
  })
})

describe('progress', () => {
  it('treats missing and non-finite stats as zero', () => {
    expect(getTrophyStatValue(volume, {})).toBe(0)
    expect(getTrophyStatValue(volume, { totalVolumeMana: NaN })).toBe(0)
    expect(getTrophyStatValue(volume, { totalVolumeMana: Infinity })).toBe(0)
  })

  it('finds the highest and next milestone at a threshold boundary', () => {
    expect(getHighestMilestone(volume, 9_999)).toBeNull()
    expect(getNextMilestone(volume, 9_999)?.id).toBe('goldfish')
    expect(getHighestMilestone(volume, 10_000)?.id).toBe('goldfish')
    expect(getNextMilestone(volume, 10_000)?.id).toBe('minnow')
    expect(getHighestMilestone(volume, 1e12)?.id).toBe('kraken')
    expect(getNextMilestone(volume, 1e12)).toBeNull()
  })

  it('counts the zero-threshold milestone as reached for every account', () => {
    // Account age "Newcomer" has threshold 0.
    expect(countReachedMilestones({})).toBe(1)
  })
})

describe('claims', () => {
  it('claims the requested milestone and every lower one once reached', () => {
    const toClaim = getMilestonesToClaim(volume, 'swordfish', 600_000)
    expect(toClaim?.map((m) => m.id)).toEqual([
      'goldfish',
      'minnow',
      'swordfish',
    ])
  })

  it('refuses a milestone that has not been reached, or does not exist', () => {
    expect(getMilestonesToClaim(volume, 'shark', 1_999_999)).toBeNull()
    expect(getMilestonesToClaim(volume, 'not-a-milestone', 1e12)).toBeNull()
  })

  it('ignores claims of trophies or milestones that are no longer defined', () => {
    const claims = [
      claim('trading-volume', 'goldfish'),
      claim('trading-volume', 'goldfish'),
      claim('trading-volume', 'retired-milestone'),
      claim('retired-trophy', 'goldfish'),
    ]
    expect(countClaimedMilestones(claims)).toBe(1)
    expect(getHighestClaimedMilestone(volume, claims)?.id).toBe('goldfish')
  })

  it('takes the highest claimed milestone by threshold, not by order', () => {
    const claims = [
      claim('trading-volume', 'shark'),
      claim('trading-volume', 'goldfish'),
    ]
    expect(getHighestClaimedMilestone(volume, claims)?.id).toBe('shark')
  })

  it('counts reached milestones that are not claimed yet', () => {
    const stats = { totalVolumeMana: 600_000 }
    // Three volume milestones plus Newcomer are reached.
    expect(countUnclaimedReachedMilestones(stats, [])).toBe(4)
    expect(
      countUnclaimedReachedMilestones(stats, [
        claim('trading-volume', 'goldfish'),
        claim('account-age', 'newcomer'),
      ])
    ).toBe(2)
  })

  it('counts a claimed milestone as earned after its stat drops', () => {
    const stats = { totalVolumeMana: 600_000 }
    expect(countEarnedMilestones(stats, [])).toBe(4)
    // Lucky (10 profitable markets) stays earned once claimed.
    expect(
      countEarnedMilestones(stats, [claim('profitable-markets', 'lucky')])
    ).toBe(5)
    expect(
      countEarnedMilestones(stats, [claim('trading-volume', 'goldfish')])
    ).toBe(4)
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

  it('unlocks pin slots at 0, 25 and 50 claimed milestones', () => {
    expect(getMaxShowcasePins(0)).toBe(1)
    expect(getMaxShowcasePins(24)).toBe(1)
    expect(getMaxShowcasePins(25)).toBe(2)
    expect(getMaxShowcasePins(50)).toBe(3)
    expect(getMaxShowcasePins(10_000)).toBe(MAX_SHOWCASE_PINS)
  })

  it('round-trips trophy pin ids', () => {
    expect(getTrophyIdFromPin(getTrophyPinId('trading-volume'))).toBe(
      'trading-volume'
    )
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
    const one = [claim('trading-volume', 'goldfish')]
    expect(
      getShowcasePinsError([getTrophyPinId('comments')], one)
    ).not.toBeNull()
    expect(getShowcasePinsError(['trophy-nope'], one)).not.toBeNull()
    expect(getShowcasePinsError(['something-else'], one)).not.toBeNull()
    expect(
      getShowcasePinsError(
        [getTrophyPinId('trading-volume'), getTrophyPinId('trading-volume')],
        one
      )
    ).not.toBeNull()
    // One claim unlocks one slot.
    expect(
      getShowcasePinsError(
        [getTrophyPinId('trading-volume'), LEAGUE_SHOWCASE_PIN],
        one
      )
    ).not.toBeNull()
  })
})

describe('formatTrophyValue', () => {
  it('shows whole numbers', () => {
    const volume = getTrophyDefinition('trading-volume')!
    expect(formatTrophyValue(volume, 360.867)).toBe('361')
    expect(formatTrophyValue(volume, 360_867)).toBe('361K')
    expect(formatTrophyValue(volume, 2_500_000)).toBe('2.5M')
    const charity = getTrophyDefinition('charity-donated')!
    expect(formatTrophyValue(charity, 12.5)).toBe('$13')
    const comments = getTrophyDefinition('comments')!
    expect(formatTrophyValue(comments, 1234)).toBe('1,234')
  })
})
