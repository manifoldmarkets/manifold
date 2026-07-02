import { isUnderageDenial } from './idenfy-helpers'

// Fixed reference time so age math is deterministic regardless of when the
// test suite runs. NOW = 2026-06-01T00:00:00Z.
const NOW = Date.UTC(2026, 5, 1)

describe('isUnderageDenial — docDob age math', () => {
  it('returns true when docDob makes user under 18', () => {
    // 17 years old: born 2009-01-01
    expect(
      isUnderageDenial({ data: { docDob: '2009-01-01' } }, NOW)
    ).toBe(true)
  })

  it('returns false when docDob makes user 18 or older', () => {
    // Born 2007-01-01 → 19 years old at NOW
    expect(
      isUnderageDenial({ data: { docDob: '2007-01-01' } }, NOW)
    ).toBe(false)
  })

  it('returns false when docDob makes user exactly 18 (passed threshold)', () => {
    // Born 2008-01-01 → ~18.4 years at NOW
    expect(
      isUnderageDenial({ data: { docDob: '2008-01-01' } }, NOW)
    ).toBe(false)
  })

  it('returns true when docDob makes user just barely under 18', () => {
    // Born 2008-07-01 → ~17.9 years at NOW (2026-06-01)
    expect(
      isUnderageDenial({ data: { docDob: '2008-07-01' } }, NOW)
    ).toBe(true)
  })

  it('falls through to keyword scan when docDob is malformed', () => {
    expect(
      isUnderageDenial(
        {
          data: { docDob: 'not-a-date' },
          status: { denyReasons: ['UNDERAGE'] },
        },
        NOW
      )
    ).toBe(true)
  })

  it('returns false when docDob is null and no age reasons', () => {
    expect(
      isUnderageDenial(
        {
          data: { docDob: null },
          status: { denyReasons: ['FACE_MISMATCH'] },
        },
        NOW
      )
    ).toBe(false)
  })
})

describe('isUnderageDenial — reason keyword scan', () => {
  it('matches UNDER 18 / under-18 variants', () => {
    expect(
      isUnderageDenial({ status: { denyReasons: ['User is under 18'] } }, NOW)
    ).toBe(true)
    expect(
      isUnderageDenial({ status: { denyReasons: ['UNDER18'] } }, NOW)
    ).toBe(true)
    expect(
      isUnderageDenial({ status: { denyReasons: ['UNDER-18'] } }, NOW)
    ).toBe(false)
  })

  it('matches UNDERAGE / MINOR / UNDER-AGE', () => {
    expect(
      isUnderageDenial({ status: { denyReasons: ['underage'] } }, NOW)
    ).toBe(true)
    expect(
      isUnderageDenial({ status: { denyReasons: ['User is a minor'] } }, NOW)
    ).toBe(true)
    expect(
      isUnderageDenial({ status: { denyReasons: ['Under-age user'] } }, NOW)
    ).toBe(true)
  })

  it('matches GIDX age codes ID-UA18 / ID-UA19', () => {
    expect(
      isUnderageDenial({ status: { denyReasons: ['ID-UA18'] } }, NOW)
    ).toBe(true)
    expect(
      isUnderageDenial({ status: { denyReasons: ['ID-UA19'] } }, NOW)
    ).toBe(true)
  })

  it('matches structured age failure tokens', () => {
    expect(
      isUnderageDenial(
        { status: { denyReasons: ['AGE_LIMIT_NOT_MET'] } },
        NOW
      )
    ).toBe(true)
    expect(
      isUnderageDenial({ status: { denyReasons: ['AGE-RESTRICTION'] } }, NOW)
    ).toBe(true)
    expect(
      isUnderageDenial({ status: { denyReasons: ['AGE FAIL'] } }, NOW)
    ).toBe(true)
  })

  it('does NOT false-positive on substrings (the regression the audit caught)', () => {
    // "ID-VERIFIED" contains the substring "AGE" — should NOT match.
    expect(
      isUnderageDenial({ status: { denyReasons: ['ID-VERIFIED'] } }, NOW)
    ).toBe(false)
    // "MANAGEMENT" contains "AGE" — should NOT match.
    expect(
      isUnderageDenial({ status: { denyReasons: ['management review'] } }, NOW)
    ).toBe(false)
    // "ID-UA20" (over 18 in some states) — should NOT match the UA18/UA19 regex.
    expect(
      isUnderageDenial({ status: { denyReasons: ['ID-UA20'] } }, NOW)
    ).toBe(false)
  })

  it('also scans suspicionReasons', () => {
    expect(
      isUnderageDenial({ status: { suspicionReasons: ['UNDERAGE'] } }, NOW)
    ).toBe(true)
  })

  it('returns false on empty/null payload', () => {
    expect(isUnderageDenial({}, NOW)).toBe(false)
    expect(isUnderageDenial({ status: null, data: null }, NOW)).toBe(false)
    expect(
      isUnderageDenial(
        { status: { denyReasons: [], suspicionReasons: [] } },
        NOW
      )
    ).toBe(false)
  })
})

describe('isUnderageDenial — fail-closed semantic', () => {
  // The helper returns false ("not underage") when it cannot determine,
  // because the caller will then fall into the generic-denial branch and
  // block BOTH bonuses and sweepstakes. That's the safe failure mode.
  it('returns false when input is ambiguous', () => {
    expect(
      isUnderageDenial(
        { status: { denyReasons: ['UNKNOWN_FAILURE'] } },
        NOW
      )
    ).toBe(false)
  })
})
