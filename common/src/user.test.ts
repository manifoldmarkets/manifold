import {
  hasFullBonusAccess,
  hasAccountTrustSignal,
  canEnterPrizeDrawings,
  canPostSocially,
  isIdentityVerified,
  getEffectiveTier,
  NEW_USER_COMMENT_GATE_MS,
  paysLegacyReferralHalves,
  type User,
} from './user'
import {
  getEffectiveBonusMultiplier,
  normalizeRecordedTier,
} from './supporter-config'

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

describe('hasFullBonusAccess — verification is optional', () => {
  it('true for undefined (never-verified users get full bonuses)', () => {
    expect(hasFullBonusAccess(u({}))).toBe(true)
  })
  it('true for verified, grandfathered, and eligible', () => {
    expect(hasFullBonusAccess(u({ bonusEligibility: 'verified' }))).toBe(true)
    expect(hasFullBonusAccess(u({ bonusEligibility: 'grandfathered' }))).toBe(
      true
    )
    expect(hasFullBonusAccess(u({ bonusEligibility: 'eligible' }))).toBe(true)
  })
  it('false for ineligible (bonus-blocked)', () => {
    expect(hasFullBonusAccess(u({ bonusEligibility: 'ineligible' }))).toBe(
      false
    )
  })
  it('false for requires_verification (admin-flagged)', () => {
    expect(
      hasFullBonusAccess(u({ bonusEligibility: 'requires_verification' }))
    ).toBe(false)
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
    expect(isIdentityVerified(u({ bonusEligibility: 'ineligible' }))).toBe(
      false
    )
    expect(
      isIdentityVerified(u({ bonusEligibility: 'requires_verification' }))
    ).toBe(false)
    expect(isIdentityVerified(u({}))).toBe(false)
  })
})

describe('canEnterPrizeDrawings — still requires identity verification', () => {
  // Every account now has full bonus access by default, so the prize fallback
  // must key off isIdentityVerified, never hasFullBonusAccess — otherwise every
  // new account would leak into the cash raffles.
  it('false for a default (never-verified) account despite full bonuses', () => {
    const fresh = u({})
    expect(hasFullBonusAccess(fresh)).toBe(true)
    expect(canEnterPrizeDrawings(fresh)).toBe(false)
  })
  it('false for eligible (purchaser, not KYC)', () => {
    expect(canEnterPrizeDrawings(u({ bonusEligibility: 'eligible' }))).toBe(
      false
    )
  })
  it('true for verified and grandfathered', () => {
    expect(canEnterPrizeDrawings(u({ bonusEligibility: 'verified' }))).toBe(
      true
    )
    expect(
      canEnterPrizeDrawings(u({ bonusEligibility: 'grandfathered' }))
    ).toBe(true)
  })
  it('false for ineligible and requires_verification', () => {
    expect(canEnterPrizeDrawings(u({ bonusEligibility: 'ineligible' }))).toBe(
      false
    )
    // Flagged users shouldn't enter drawings while their flag is open.
    expect(
      canEnterPrizeDrawings(u({ bonusEligibility: 'requires_verification' }))
    ).toBe(false)
  })
})

describe('canEnterPrizeDrawings — explicit overrides', () => {
  it('true when prizeEligibility = "eligible" regardless of bonus state', () => {
    // The "verified for prizes but not bonuses" axis.
    expect(
      canEnterPrizeDrawings(
        u({
          bonusEligibility: 'ineligible',
          prizeEligibility: 'eligible',
        })
      )
    ).toBe(true)
    expect(
      canEnterPrizeDrawings(
        u({
          bonusEligibility: 'requires_verification',
          prizeEligibility: 'eligible',
        })
      )
    ).toBe(true)
  })

  it('false when prizeEligibility = "ineligible" regardless of bonus state', () => {
    // Under-18 with verified ID keeps mana bonuses but loses prize access; a
    // failed iDenfy attempt pins this without touching bonuses.
    for (const bonusEligibility of [
      'verified',
      'grandfathered',
      undefined,
    ] as const) {
      const user = u({ bonusEligibility, prizeEligibility: 'ineligible' })
      expect(canEnterPrizeDrawings(user)).toBe(false)
      expect(hasFullBonusAccess(user)).toBe(true)
    }
  })
})

describe('getEffectiveTier — only explicit deny states drop below free', () => {
  it('undefined / verified / grandfathered / eligible are all free', () => {
    expect(getEffectiveTier(u({}))).toBe('free')
    for (const bonusEligibility of [
      'verified',
      'grandfathered',
      'eligible',
    ] as const) {
      expect(getEffectiveTier(u({ bonusEligibility }))).toBe('free')
    }
  })
  it("'requires_verification' (flagged) maps to restricted (ZERO bonuses)", () => {
    expect(
      getEffectiveTier(u({ bonusEligibility: 'requires_verification' }))
    ).toBe('restricted')
  })
  it("'ineligible' (bonus-blocked) maps to reduced (0.2x, not zero)", () => {
    expect(getEffectiveTier(u({ bonusEligibility: 'ineligible' }))).toBe(
      'reduced'
    )
    expect(getEffectiveBonusMultiplier('reduced', 'quest')).toBe(0.2)
  })
  it('free earns the full 1x on every bonus kind', () => {
    for (const kind of [
      'quest',
      'streak',
      'referral',
      'uniqueTrader',
    ] as const) {
      expect(getEffectiveBonusMultiplier('free', kind)).toBe(1)
    }
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

describe('normalizeRecordedTier — tiers stored before verification was optional', () => {
  it('maps legacy unverified/verified onto reduced/free', () => {
    expect(normalizeRecordedTier('unverified')).toBe('reduced')
    expect(normalizeRecordedTier('verified')).toBe('free')
  })
  it('passes current tiers and undefined through', () => {
    expect(normalizeRecordedTier('restricted')).toBe('restricted')
    expect(normalizeRecordedTier('plus')).toBe('plus')
    expect(normalizeRecordedTier(undefined)).toBe(undefined)
  })
})

describe('canPostSocially — the new-account social gate', () => {
  const brandNew = () => ({ createdTime: Date.now() - 60_000 })

  it('blocks a brand-new account with no trust signal', () => {
    // Full bonuses by default must NOT open the social gate.
    const user = u(brandNew())
    expect(hasFullBonusAccess(user)).toBe(true)
    expect(hasAccountTrustSignal(user)).toBe(false)
    expect(canPostSocially(user)).toBe(false)
  })
  it('opens once the account is NEW_USER_COMMENT_GATE_MS old', () => {
    const user = u({ createdTime: Date.now() - NEW_USER_COMMENT_GATE_MS })
    expect(canPostSocially(user)).toBe(true)
  })
  it('verifying unlocks it early', () => {
    expect(
      canPostSocially(u({ ...brandNew(), bonusEligibility: 'verified' }))
    ).toBe(true)
  })
  it('a mana purchase or admin grant unlocks it early', () => {
    expect(canPostSocially(u({ ...brandNew(), purchasedMana: true }))).toBe(
      true
    )
    expect(
      canPostSocially(u({ ...brandNew(), bonusEligibility: 'eligible' }))
    ).toBe(true)
  })
  it('a flagged new account stays gated', () => {
    expect(
      canPostSocially(
        u({ ...brandNew(), bonusEligibility: 'requires_verification' })
      )
    ).toBe(false)
  })
})

describe('paysLegacyReferralHalves — legacy first-bet/verify referral payouts', () => {
  it('true for a referral recorded before signup-time payouts', () => {
    expect(paysLegacyReferralHalves({ referredByUserId: 'referrer' })).toBe(
      true
    )
  })
  it('false once the referral was settled at signup, even if it paid nothing', () => {
    // A flagged referrer's tier pays zero at signup, so no 'signup' txn exists;
    // the marker alone must keep the legacy halves from paying after the
    // flag clears.
    expect(
      paysLegacyReferralHalves({
        referredByUserId: 'referrer',
        referralPayoutAtSignup: true,
      })
    ).toBe(false)
  })
  it('false when the user was never referred', () => {
    expect(paysLegacyReferralHalves({})).toBe(false)
  })
})
