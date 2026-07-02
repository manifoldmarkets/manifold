import {
  hasFullBonusAccess,
  canEnterPrizeDrawings,
  isIdentityVerified,
  getEffectiveTier,
  type User,
} from './user'
import { getEffectiveBonusMultiplier } from './supporter-config'

// Build a minimal User shape — only the fields these helpers read.
const u = (overrides: Partial<User>): User =>
  ({
    id: 'test',
    createdTime: 0,
    name: 'Test',
    username: 'test',
    avatarUrl: '',
    balance: 0,
    totalDeposits: 0,
    creatorTraders: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
    cashBalance: 0,
    spiceBalance: 0,
    totalCashDeposits: 0,
    streakForgiveness: 0,
    ...overrides,
  } as User)

describe('hasFullBonusAccess', () => {
  it('true for verified', () => {
    expect(hasFullBonusAccess(u({ bonusEligibility: 'verified' }))).toBe(true)
  })
  it('true for grandfathered', () => {
    expect(hasFullBonusAccess(u({ bonusEligibility: 'grandfathered' }))).toBe(
      true
    )
  })
  it('false for ineligible', () => {
    expect(hasFullBonusAccess(u({ bonusEligibility: 'ineligible' }))).toBe(false)
  })
  it('true for eligible (purchaser / admin-granted, no KYC)', () => {
    expect(hasFullBonusAccess(u({ bonusEligibility: 'eligible' }))).toBe(true)
  })
  it('false for requires_verification (flagged alt)', () => {
    expect(
      hasFullBonusAccess(u({ bonusEligibility: 'requires_verification' }))
    ).toBe(false)
  })
  it('false for undefined (new/unverified users)', () => {
    expect(hasFullBonusAccess(u({}))).toBe(false)
  })
})

describe('isIdentityVerified — the prize-worthy (KYC) set', () => {
  it('true only for verified and grandfathered', () => {
    expect(isIdentityVerified(u({ bonusEligibility: 'verified' }))).toBe(true)
    expect(isIdentityVerified(u({ bonusEligibility: 'grandfathered' }))).toBe(
      true
    )
  })
  it('false for eligible — a purchase/grant is NOT identity verification', () => {
    expect(isIdentityVerified(u({ bonusEligibility: 'eligible' }))).toBe(false)
  })
  it('false for ineligible / requires_verification / undefined', () => {
    expect(isIdentityVerified(u({ bonusEligibility: 'ineligible' }))).toBe(false)
    expect(
      isIdentityVerified(u({ bonusEligibility: 'requires_verification' }))
    ).toBe(false)
    expect(isIdentityVerified(u({}))).toBe(false)
  })
})

describe("'eligible' (purchaser / admin-granted) — bonuses without prizes", () => {
  // The whole point of the separate 'eligible' value: a user who bought mana
  // (or was hand-granted) earns bonuses at the verified tier, but must still
  // complete KYC before entering cash raffles. This is the no-prize-leak
  // guarantee — without repointing canEnterPrizeDrawings' fallback at
  // isIdentityVerified, the broadened hasFullBonusAccess would leak prize access.
  it('gets bonuses', () => {
    expect(hasFullBonusAccess(u({ bonusEligibility: 'eligible' }))).toBe(true)
  })
  it('does NOT get prize access when prizeEligibility is unset (no leak)', () => {
    expect(canEnterPrizeDrawings(u({ bonusEligibility: 'eligible' }))).toBe(
      false
    )
  })
  it('earns at the verified effective tier', () => {
    expect(getEffectiveTier(u({ bonusEligibility: 'eligible' }))).toBe(
      'verified'
    )
  })
  it('CAN enter drawings once an admin explicitly grants prize eligibility', () => {
    // e.g. they later complete KYC and an admin pins prizeEligibility, or the
    // operator decides to grant prize access directly. Explicit override wins.
    expect(
      canEnterPrizeDrawings(
        u({ bonusEligibility: 'eligible', prizeEligibility: 'eligible' })
      )
    ).toBe(true)
  })
})

describe('canEnterPrizeDrawings — explicit overrides', () => {
  it('true when prizeEligibility = "eligible" regardless of bonus state', () => {
    // Explicit prize eligibility wins even over an ineligible bonus state.
    // This is the "verified for prizes but not bonuses" axis.
    expect(
      canEnterPrizeDrawings(
        u({
          bonusEligibility: 'ineligible',
          prizeEligibility: 'eligible',
        })
      )
    ).toBe(true)
  })

  it('false when prizeEligibility = "ineligible" regardless of bonus state', () => {
    // The decoupling motivation: under-18 with verified ID keeps mana bonuses
    // (bonusEligibility = 'verified') but loses prize-drawing access.
    expect(
      canEnterPrizeDrawings(
        u({
          bonusEligibility: 'verified',
          prizeEligibility: 'ineligible',
        })
      )
    ).toBe(false)
    expect(
      canEnterPrizeDrawings(
        u({
          bonusEligibility: 'grandfathered',
          prizeEligibility: 'ineligible',
        })
      )
    ).toBe(false)
  })
})

describe('canEnterPrizeDrawings — fallback to identity verification', () => {
  // When prizeEligibility is unset, fall back to isIdentityVerified (NOT the
  // broadened hasFullBonusAccess). This is the back-compat path — existing
  // verified/grandfathered users keep prize access with no backfill — while
  // ensuring purchaser/granted ('eligible') users don't leak into prizes.
  it('falls back to true for verified users', () => {
    expect(
      canEnterPrizeDrawings(u({ bonusEligibility: 'verified' }))
    ).toBe(true)
  })

  it('falls back to true for grandfathered users', () => {
    expect(
      canEnterPrizeDrawings(u({ bonusEligibility: 'grandfathered' }))
    ).toBe(true)
  })

  it('falls back to false for eligible users (purchaser, not KYC)', () => {
    expect(canEnterPrizeDrawings(u({ bonusEligibility: 'eligible' }))).toBe(
      false
    )
  })

  it('falls back to false for ineligible users', () => {
    expect(
      canEnterPrizeDrawings(u({ bonusEligibility: 'ineligible' }))
    ).toBe(false)
  })

  it('falls back to false for undefined bonus state', () => {
    expect(canEnterPrizeDrawings(u({}))).toBe(false)
  })

  it('falls back to false for requires_verification bonus state', () => {
    // A user flagged via admin-flag-for-verification gets
    // bonusEligibility='requires_verification', and prizeEligibility is
    // typically left unset. The fallback must block them — flagged users
    // shouldn't be able to enter prize drawings while their flag is open.
    expect(
      canEnterPrizeDrawings(u({ bonusEligibility: 'requires_verification' }))
    ).toBe(false)
  })
})

describe('decoupling invariant — both axes independently togglable', () => {
  // The core motivation: an under-18 user keeps mana bonuses but loses
  // prize access. Verify both fields can be set independently.
  it('under-18 user (verified bonuses, ineligible prize) keeps mana bonuses', () => {
    const minor = u({
      bonusEligibility: 'verified',
      prizeEligibility: 'ineligible',
    })
    expect(hasFullBonusAccess(minor)).toBe(true)
    expect(canEnterPrizeDrawings(minor)).toBe(false)
  })

  it('"prize-only" user (ineligible bonuses, eligible prize) can still enter drawings', () => {
    // Constructible per the type system. Whether the operator ever creates
    // this combo is a policy choice — the helpers must not conflate axes.
    const prizeOnly = u({
      bonusEligibility: 'ineligible',
      prizeEligibility: 'eligible',
    })
    expect(hasFullBonusAccess(prizeOnly)).toBe(false)
    expect(canEnterPrizeDrawings(prizeOnly)).toBe(true)
  })

  it('flagged user with an admin-pinned prize grant keeps prize access but loses bonuses', () => {
    // requires_verification (suspected alt) blocks bonuses, but an explicit
    // prizeEligibility='eligible' override still wins for the prize axis —
    // proving the flag doesn't bleed across axes.
    const flaggedButPrizePinned = u({
      bonusEligibility: 'requires_verification',
      prizeEligibility: 'eligible',
    })
    expect(hasFullBonusAccess(flaggedButPrizePinned)).toBe(false)
    expect(canEnterPrizeDrawings(flaggedButPrizePinned)).toBe(true)
  })
})

describe('getEffectiveTier — bonusEligibility maps to the right tier', () => {
  it("'eligible' (purchaser) earns at the verified tier", () => {
    expect(getEffectiveTier(u({ bonusEligibility: 'eligible' }))).toBe(
      'verified'
    )
  })
  it("'requires_verification' (flagged) maps to the restricted tier (ZERO bonuses)", () => {
    // A flagged/suspected-alt account earns nothing until they verify —
    // distinct from a brand-new 'unverified' user, who still earns 0.2x.
    expect(
      getEffectiveTier(u({ bonusEligibility: 'requires_verification' }))
    ).toBe('restricted')
  })
  it("'ineligible' (KYC-failed) stays unverified (reduced 0.2x, not zero)", () => {
    expect(getEffectiveTier(u({ bonusEligibility: 'ineligible' }))).toBe(
      'unverified'
    )
  })
  it('undefined (new user) is unverified; verified/grandfathered are verified', () => {
    expect(getEffectiveTier(u({}))).toBe('unverified')
    expect(getEffectiveTier(u({ bonusEligibility: 'verified' }))).toBe(
      'verified'
    )
    expect(getEffectiveTier(u({ bonusEligibility: 'grandfathered' }))).toBe(
      'verified'
    )
  })
})

describe('restricted tier (flagged) earns zero — except the unique-trader bonus', () => {
  it('quest/streak/referral multipliers are 0', () => {
    for (const kind of ['quest', 'streak', 'referral'] as const) {
      expect(getEffectiveBonusMultiplier('restricted', kind)).toBe(0)
    }
  })
  it('unique-trader multiplier is full (1) — narrow abuse vector', () => {
    expect(getEffectiveBonusMultiplier('restricted', 'uniqueTrader')).toBe(1)
  })
})
