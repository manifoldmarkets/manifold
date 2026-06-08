import {
  canReceiveBonuses,
  canEnterPrizeDrawings,
  isIdentityVerified,
  getEffectiveTier,
  type User,
} from './user'

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

describe('canReceiveBonuses', () => {
  it('true for verified', () => {
    expect(canReceiveBonuses(u({ bonusEligibility: 'verified' }))).toBe(true)
  })
  it('true for grandfathered', () => {
    expect(canReceiveBonuses(u({ bonusEligibility: 'grandfathered' }))).toBe(
      true
    )
  })
  it('false for ineligible', () => {
    expect(canReceiveBonuses(u({ bonusEligibility: 'ineligible' }))).toBe(false)
  })
  it('true for eligible (purchaser / admin-granted, no KYC)', () => {
    expect(canReceiveBonuses(u({ bonusEligibility: 'eligible' }))).toBe(true)
  })
  it('false for requires_verification (flagged alt)', () => {
    expect(
      canReceiveBonuses(u({ bonusEligibility: 'requires_verification' }))
    ).toBe(false)
  })
  it('false for undefined (new/unverified users)', () => {
    expect(canReceiveBonuses(u({}))).toBe(false)
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
  // isIdentityVerified, the broadened canReceiveBonuses would leak prize access.
  it('gets bonuses', () => {
    expect(canReceiveBonuses(u({ bonusEligibility: 'eligible' }))).toBe(true)
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
  // broadened canReceiveBonuses). This is the back-compat path — existing
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
    expect(canReceiveBonuses(minor)).toBe(true)
    expect(canEnterPrizeDrawings(minor)).toBe(false)
  })

  it('"prize-only" user (ineligible bonuses, eligible prize) can still enter drawings', () => {
    // Constructible per the type system. Whether the operator ever creates
    // this combo is a policy choice — the helpers must not conflate axes.
    const prizeOnly = u({
      bonusEligibility: 'ineligible',
      prizeEligibility: 'eligible',
    })
    expect(canReceiveBonuses(prizeOnly)).toBe(false)
    expect(canEnterPrizeDrawings(prizeOnly)).toBe(true)
  })
})
