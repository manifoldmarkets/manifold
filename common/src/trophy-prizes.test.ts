import { SUPPORTER_TIERS } from 'common/supporter-config'
import {
  TROPHY_DEFINITIONS,
  TROPHY_TIER_ORDER,
  isStarterTrophy,
} from 'common/trophies'
import {
  LIFETIME_PRIZES_BY_TIER,
  MILESTONE_PRIZES,
  NO_MANA_TROPHY_IDS,
  RANK_TIER_PRIZES,
  TrophyPrize,
  addPrizeTotals,
  applyPrizeStanding,
  formatPrizeParts,
  getMilestonePrize,
  getPrizeStanding,
  isEmptyPrizeTotal,
  totalPrizes,
} from 'common/trophy-prizes'

// Rough mana value of a prize, to check the colour schedule only climbs.
// A freeze is priced at M50 here; membership at the shop's monthly price.
const prizeValue = (p: TrophyPrize) => {
  const days = p.membership?.days ?? 0
  const tier = p.membership?.tier
  const monthly = tier && tier !== 'paid-tier' ? SUPPORTER_TIERS[tier].price : 0
  return (p.mana ?? 0) + (p.freezes ?? 0) * 50 + (days * monthly) / 30
}

const allPrizes = (): TrophyPrize[] => [
  ...Object.values(LIFETIME_PRIZES_BY_TIER),
  ...Object.values(MILESTONE_PRIZES).flatMap((byId) => Object.values(byId)),
  ...Object.values(RANK_TIER_PRIZES),
]

describe('trophy prizes', () => {
  it('gives every starter milestone its own prize', () => {
    for (const def of TROPHY_DEFINITIONS.filter(isStarterTrophy)) {
      for (const m of def.milestones) {
        expect([def.id, m.id, MILESTONE_PRIZES[def.id]?.[m.id]]).toEqual([
          def.id,
          m.id,
          expect.any(Object),
        ])
      }
    }
  })

  it('names only defined trophies and milestones in MILESTONE_PRIZES', () => {
    const defined = new Set(
      TROPHY_DEFINITIONS.flatMap((def) =>
        def.milestones.map((m) => `${def.id}/${m.id}`)
      )
    )
    const unknown = Object.entries(MILESTONE_PRIZES).flatMap(
      ([trophyId, byMilestone]) =>
        Object.keys(byMilestone)
          .map((milestoneId) => `${trophyId}/${milestoneId}`)
          .filter((key) => !defined.has(key))
    )
    expect(unknown).toEqual([])
    // An own prize is never empty: a typo there would pay nothing.
    for (const byMilestone of Object.values(MILESTONE_PRIZES)) {
      for (const prize of Object.values(byMilestone)) {
        expect(isEmptyPrizeTotal(totalPrizes([prize]))).toBe(false)
      }
    }
  })

  it('pays something for every lifetime milestone, for new and old accounts', () => {
    for (const def of TROPHY_DEFINITIONS.filter((d) => !isStarterTrophy(d))) {
      for (const m of def.milestones) {
        for (const isStarterAccount of [true, false]) {
          const total = totalPrizes([
            getMilestonePrize(def.id, m, { isStarterAccount }),
          ])
          expect([def.id, m.id, isEmptyPrizeTotal(total)]).toEqual([
            def.id,
            m.id,
            false,
          ])
        }
      }
    }
  })

  it('uses only finite, positive amounts and whole days and freezes', () => {
    for (const p of allPrizes()) {
      if (p.mana !== undefined) {
        expect(Number.isFinite(p.mana) && p.mana > 0).toBe(true)
      }
      if (p.freezes !== undefined) {
        expect(Number.isInteger(p.freezes) && p.freezes > 0).toBe(true)
      }
      if (p.membership) {
        expect(
          Number.isInteger(p.membership.days) && p.membership.days > 0
        ).toBe(true)
        expect(['basic', 'plus', 'premium', 'paid-tier']).toContain(
          p.membership.tier
        )
      }
    }
  })

  it('climbs in value with each colour', () => {
    const values = [...TROPHY_TIER_ORDER]
      .reverse()
      .map((tier) => prizeValue(LIFETIME_PRIZES_BY_TIER[tier]))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })

  it('pays no mana on Leagues, Account Age or Legacy Charity, except Newcomer for new accounts', () => {
    for (const def of TROPHY_DEFINITIONS.filter((d) =>
      NO_MANA_TROPHY_IDS.includes(d.id)
    )) {
      for (const m of def.milestones) {
        const prize = getMilestonePrize(def.id, m, { isStarterAccount: false })
        expect([def.id, m.id, prize.mana ?? 0]).toEqual([def.id, m.id, 0])
      }
    }
    // The swapped mana becomes a freeze.
    expect(
      getMilestonePrize(
        'leagues',
        { id: 'any', tier: 'gold' },
        { isStarterAccount: false }
      )
    ).toEqual({ freezes: 1, membership: { tier: 'plus', days: 3 } })
  })

  it('pays Newcomer as mana to new accounts and a freeze to everyone else', () => {
    const newcomer = { id: 'newcomer', tier: 'green' as const }
    expect(
      getMilestonePrize('account-age', newcomer, { isStarterAccount: true })
    ).toEqual({ mana: 50 })
    expect(
      getMilestonePrize('account-age', newcomer, { isStarterAccount: false })
    ).toEqual({ freezes: 1 })
  })

  it('gives unknown starter milestones nothing rather than a colour prize', () => {
    expect(
      getMilestonePrize(
        'starter-trades',
        { id: 'not-a-milestone', tier: 'prismatic' },
        { isStarterAccount: true }
      )
    ).toEqual({})
  })

  it('applies account standing', () => {
    const total = totalPrizes([
      { mana: 100, freezes: 2, membership: { tier: 'basic', days: 3 } },
    ])
    expect(applyPrizeStanding(total, getPrizeStanding('free', 1))).toEqual(
      total
    )
    expect(applyPrizeStanding(total, getPrizeStanding('premium', 2))).toEqual(
      total
    )
    expect(applyPrizeStanding(total, getPrizeStanding('reduced', 0.2))).toEqual(
      { mana: 20, freezes: 2, membership: [] }
    )
    expect(
      applyPrizeStanding(total, getPrizeStanding('restricted', 0))
    ).toEqual({ mana: 0, freezes: 0, membership: [] })
    expect(
      applyPrizeStanding(total, getPrizeStanding('free', Number.NaN))
    ).toEqual({ ...total, mana: 0 })
  })

  it('sums prizes and keeps each membership grant', () => {
    expect(
      totalPrizes([
        { mana: 50, freezes: 1 },
        { membership: { tier: 'basic', days: 2 } },
        { mana: 25, membership: { tier: 'basic', days: 1 } },
        { mana: Number.NaN, freezes: -1 },
      ])
    ).toEqual({
      mana: 75,
      freezes: 1,
      membership: [
        { tier: 'basic', days: 2 },
        { tier: 'basic', days: 1 },
      ],
    })
  })

  it('adds totals, rounding mana to 0.01 and ignoring bad amounts', () => {
    expect(addPrizeTotals([])).toEqual({ mana: 0, freezes: 0, membership: [] })
    expect(
      addPrizeTotals([
        { mana: 0.1, freezes: 1, membership: [{ tier: 'basic', days: 2 }] },
        { mana: 0.2, freezes: 2, membership: [] },
        { mana: Number.NaN, freezes: -3, membership: [] },
        { mana: 10, freezes: 0, membership: [{ tier: 'plus', days: 1 }] },
      ])
    ).toEqual({
      mana: 10.3,
      freezes: 3,
      membership: [
        { tier: 'basic', days: 2 },
        { tier: 'plus', days: 1 },
      ],
    })
  })

  it('formats prizes for display', () => {
    expect(
      formatPrizeParts(
        totalPrizes([
          { mana: 1_000, freezes: 2 },
          { membership: { tier: 'basic', days: 2 } },
          { membership: { tier: 'basic', days: 1 } },
          { membership: { tier: 'plus', days: 1 } },
        ])
      )
    ).toEqual(['M1,000', '2 freezes', '1 day of Pro', '3 days of Plus'])
    expect(formatPrizeParts(totalPrizes([{ mana: 0.2 }]))).toEqual(['M0.20'])
    expect(formatPrizeParts(totalPrizes([]))).toEqual([])
  })
})
