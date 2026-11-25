import {
  capGrantDuration,
  getMembershipGrantView,
  GrantSupporterRow,
  MAX_FREE_MEMBERSHIP_HELD_MS,
  MembershipGrant,
  membershipChangeCredit,
  planGrantEnd,
  planGrantStart,
  planGrantTransition,
} from './membership-grants'
import { SUPPORTER_TIERS, SupporterTier, TIER_ORDER } from './supporter-config'
import { DAY_MS, HOUR_MS } from './util/time'

const now = Date.UTC(2026, 10, 25)
const grant = (props: Partial<MembershipGrant> = {}): MembershipGrant => ({
  id: '1',
  userId: 'member',
  tier: 'plus',
  durationMs: 3 * DAY_MS,
  source: 'trophy',
  sourceId: 'net-worth/whale',
  status: 'banked',
  createdTime: now - 200,
  startedTime: null,
  endsTime: null,
  endedTime: null,
  pausedPaid: null,
  note: null,
  ...props,
})
const row = (
  tier: SupporterTier,
  remaining: number,
  autoRenew = true
): GrantSupporterRow => ({
  entitlementId: SUPPORTER_TIERS[tier].id,
  enabled: true,
  expiresTime: now + remaining,
  autoRenew,
  grantedTime: now - 40 * DAY_MS,
})
function activate(
  start: NonNullable<ReturnType<typeof planGrantStart>>
): MembershipGrant {
  return {
    ...start.grant,
    status: 'active',
    startedTime: now,
    endsTime: start.newRow.expiresTime!,
    pausedPaid: start.pausedPaid,
  }
}

describe('membership grant transitions', () => {
  it('conserves paid milliseconds and credit across tier pairs, cancellations and scheduler delays', () => {
    let seed = 12345
    const random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0)
    for (const oldTier of TIER_ORDER)
      for (const tier of TIER_ORDER)
        for (let i = 0; i < 40; i++) {
          const sample = random()
          const remaining = [
            sample + 1,
            -(sample % (25 * HOUR_MS)),
            -25 * HOUR_MS - sample,
          ][i % 3]
          const paid = row(oldTier, remaining, i % 2 === 0)
          const banked = grant({
            tier,
            durationMs: (random() % MAX_FREE_MEMBERSHIP_HELD_MS) + 1,
          })
          const start = planGrantStart(paid, [banked], now)
          const hasAccess =
            remaining > 0 || (paid.autoRenew && remaining > -25 * HOUR_MS)
          if (
            hasAccess &&
            SUPPORTER_TIERS[oldTier].order > SUPPORTER_TIERS[tier].order
          ) {
            expect(start).toBeNull()
            continue
          }
          if (!start) throw new Error('Expected eligible grant')
          const active = activate(start)
          expect(start.newRow).toMatchObject({
            expiresTime: now + banked.durationMs,
            autoRenew: false,
            grantedTime: paid.grantedTime,
          })
          expect(
            planGrantStart(start.newRow, [active, grant({ id: '2' })], now)
          ).toBeNull()
          expect(planGrantEnd(active, active.endsTime! - 1)).toBeNull()
          const end = active.endsTime! + random()
          const restored = planGrantEnd(active, end)!.newRow
          if (hasAccess || paid.autoRenew) {
            expect(start.pausedPaid?.remainingMs).toBe(remaining)
            expect(restored).toEqual({ ...paid, expiresTime: end + remaining })
          } else {
            expect(restored).toBeNull()
          }
          for (const target of TIER_ORDER) {
            const id = SUPPORTER_TIERS[target].id
            expect(membershipChangeCredit(start.newRow, id, now)).toBe(0)
            expect(membershipChangeCredit(restored, id, end)).toBe(
              membershipChangeCredit(paid, id, now)
            )
          }
          const used = { ...active, status: 'used' as const }
          expect(planGrantEnd(used, end)).toBeNull()
          expect(planGrantTransition(restored, [used], end).start).toBeNull()
        }
  })

  it('credits paid fractional days at the shop price only on a tier change', () => {
    const paid = row('plus', 1.5 * DAY_MS)
    expect(membershipChangeCredit(paid, 'supporter-premium', now)).toBe(125)
    expect(membershipChangeCredit(paid, 'supporter-plus', now)).toBe(0)
    const start = planGrantStart(paid, [grant()], now)!
    expect(membershipChangeCredit(start.newRow, 'supporter-premium', now)).toBe(
      0
    )
  })

  it('picks highest tier, then oldest receipt, then identity on timestamp ties', () => {
    const banked = [
      grant(),
      grant({ id: '12', tier: 'premium' }),
      grant({ id: '4', tier: 'premium' }),
      grant({ id: '5', tier: 'premium', createdTime: now - 500 }),
    ]
    expect(planGrantStart(null, banked, now)?.grant.id).toBe('5')
    expect(planGrantStart(null, banked.slice(0, 3), now)?.grant.id).toBe('4')
  })

  it('restores a renewal with exactly one millisecond of grace left', () => {
    const grace = row('premium', -25 * HOUR_MS + 1)
    expect(planGrantStart(grace, [grant()], now)).toBeNull()
    const active = activate(
      planGrantStart(grace, [grant({ tier: 'premium' })], now)!
    )
    expect(active.pausedPaid?.remainingMs).toBe(-25 * HOUR_MS + 1)
    expect(planGrantEnd(active, active.endsTime!)?.newRow).toEqual({
      ...grace,
      expiresTime: active.endsTime! - 25 * HOUR_MS + 1,
    })
  })

  it('allows a lower grant after grace and restores the outstanding higher-tier renewal', () => {
    for (const overdue of [-25 * HOUR_MS, -50 * HOUR_MS]) {
      const paid = row('premium', overdue)
      const start = planGrantStart(paid, [grant({ tier: 'basic' })], now)!
      expect(start.pausedPaid).toMatchObject({
        tier: 'premium',
        remainingMs: overdue,
        autoRenew: true,
      })
      const active = activate(start)
      expect(getMembershipGrantView(start.newRow, [active], now)).toMatchObject(
        {
          paid: { daysLeft: 0 },
          next: { kind: 'renewal', tier: 'premium' },
        }
      )
      expect(planGrantEnd(active, active.endsTime!)?.newRow).toEqual({
        ...paid,
        expiresTime: active.endsTime! + overdue,
      })
    }
  })

  it.each([-HOUR_MS, DAY_MS])(
    'preserves a disabled renewing row with %i ms remaining',
    (remaining) => {
      const paid = { ...row('premium', remaining), enabled: false }
      const start = planGrantStart(paid, [grant({ tier: 'basic' })], now)!
      const active = activate(start)
      expect(planGrantEnd(active, active.endsTime!)?.newRow).toEqual({
        ...paid,
        expiresTime: active.endsTime! + remaining,
      })
    }
  )

  it('discards lapsed rows with no outstanding renewal', () => {
    for (const lapsed of [
      row('premium', -25 * HOUR_MS, false),
      row('premium', 0, false),
      null,
    ]) {
      const start = planGrantStart(lapsed, [grant()], now)!
      expect(start.pausedPaid).toBeNull()
      expect(planGrantEnd(activate(start), start.newRow.expiresTime!)).toEqual({
        newRow: null,
      })
    }
  })

  it('hands the paid snapshot directly to the next eligible grant and respects cancellation while paused', () => {
    const start = planGrantStart(
      row('plus', 123456),
      [grant({ tier: 'premium' })],
      now
    )!
    const active = activate(start)
    active.pausedPaid = { ...active.pausedPaid!, autoRenew: false }
    const next = grant({ id: '2', tier: 'plus' })
    const end = active.endsTime! + 604321
    const again = planGrantTransition(
      start.newRow,
      [active, next, grant({ id: '3', tier: 'basic' })],
      end
    ).start!
    expect(again.grant.id).toBe(next.id)
    expect(again.pausedPaid).toEqual(active.pausedPaid)
    expect(again.newRow.expiresTime).toBe(end + next.durationMs)
    expect(
      planGrantEnd(activate(again), again.newRow.expiresTime!)?.newRow
    ).toEqual({
      ...row('plus', 0, false),
      expiresTime: again.newRow.expiresTime! + 123456,
    })
    expect(
      planGrantTransition(
        start.newRow,
        [active, grant({ tier: 'basic', id: '3' })],
        end
      ).start
    ).toBeNull()
  })

  it('shows active, waiting paid and banked time without exposing private notes', () => {
    const start = planGrantStart(
      row('basic', DAY_MS + 1, false),
      [grant()],
      now
    )!
    const view = getMembershipGrantView(
      start.newRow,
      [activate(start), grant({ id: '2' })],
      now
    )
    expect(view.isLocked).toBe(true)
    expect(view.paid).toEqual({ tier: 'basic', daysLeft: 2, autoRenew: false })
    expect(view.next).toEqual({ kind: 'free', tier: 'plus' })
    expect(view.active).toEqual({
      id: start.grant.id,
      tier: 'plus',
      endsTime: now + 3 * DAY_MS,
      source: 'trophy',
    })
    expect(view.banked[0]).toMatchObject({
      days: 3,
      reason: expect.stringMatching(/free days/),
    })
    expect(
      getMembershipGrantView(row('premium', DAY_MS), [grant()], now).banked[0]
        .reason
    ).toContain('Pro or lower')
  })

  it('keeps a grant banked behind a membership with no end date', () => {
    const permanent: GrantSupporterRow = {
      ...row('basic', 0),
      expiresTime: undefined,
    }
    expect(planGrantStart(permanent, [grant({ tier: 'premium' })], now)).toBe(
      null
    )
    expect(
      getMembershipGrantView(permanent, [grant({ tier: 'premium' })], now)
        .banked[0].reason
    ).toBe('Starts when your current membership ends.')
  })

  it('rejects a ledger/row ownership mismatch before writing', () => {
    expect(() =>
      planGrantTransition(
        row('plus', DAY_MS),
        [grant({ status: 'active' })],
        now
      )
    ).toThrow(/disagree/)
  })
})

describe('membership holding cap', () => {
  const cap = MAX_FREE_MEMBERSHIP_HELD_MS
  it('counts only banked and unspent active time', () => {
    const held = [
      grant({ durationMs: cap - 100 }),
      grant({ id: '2', status: 'active', endsTime: now + 50 }),
      grant({ status: 'used' }),
      grant({ status: 'revoked' }),
    ]
    expect(capGrantDuration(49, held, now)).toEqual({
      durationMs: 49,
      reductionNote: null,
    })
    expect(capGrantDuration(50, held, now)).toEqual({
      durationMs: 50,
      reductionNote: null,
    })
    expect(capGrantDuration(75, held, now)).toEqual({
      durationMs: 50,
      reductionNote: expect.stringContaining('75 ms to 50 ms'),
    })
    expect(capGrantDuration(51, held, now + 1000).durationMs).toBe(51)
    expect(capGrantDuration(1, [grant({ durationMs: cap })], now)).toEqual({
      durationMs: 0,
      reductionNote: expect.stringContaining('0 ms'),
    })
  })

  it.each([NaN, Infinity, -Infinity, -1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid requested or banked duration %p',
    (invalid) => {
      expect(() => capGrantDuration(invalid, [], now)).toThrow()
      expect(() =>
        capGrantDuration(1, [grant({ durationMs: invalid })], now)
      ).toThrow()
      expect(() =>
        planGrantStart(null, [grant({ durationMs: invalid })], now)
      ).toThrow()
    }
  )

  it.each([Infinity, NaN, -Infinity])(
    'rejects non-finite expiry and paid remainder %p',
    (invalid) => {
      const started = planGrantStart(row('basic', DAY_MS), [grant()], now)!
      const active = activate(started)
      expect(() =>
        capGrantDuration(1, [{ ...active, endsTime: invalid }], now)
      ).toThrow()
      expect(() =>
        planGrantStart(
          { ...row('basic', 0), expiresTime: invalid },
          [grant()],
          now
        )
      ).toThrow()
      expect(() =>
        planGrantEnd(
          {
            ...active,
            pausedPaid: { ...active.pausedPaid!, remainingMs: invalid },
          },
          active.endsTime!
        )
      ).toThrow()
    }
  )
})
