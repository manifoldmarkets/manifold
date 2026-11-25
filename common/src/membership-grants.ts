import { getShopItem } from './shop/items'
import { UserEntitlement } from './shop/types'
import {
  getSupporterEntitlement,
  SUPPORTER_TIERS,
  SupporterTier,
  TIER_ORDER,
} from './supporter-config'
import { DAY_MS } from './util/time'

export const MAX_FREE_MEMBERSHIP_HELD_MS = 30 * DAY_MS

export type PausedPaid = {
  rail: 'mana'
  tier: SupporterTier
  // Signed time to expiry. A negative value preserves time already overdue.
  remainingMs: number
  // An already lapsed, non-renewing membership keeps its historical expiry.
  lapsedExpiresTime?: string
  autoRenew: boolean
  enabled?: boolean
  grantedTime: number
  metadata?: Record<string, unknown>
}

export type MembershipGrant = {
  id: string
  userId: string
  tier: SupporterTier
  durationMs: number
  source: string
  sourceId: string
  status: 'banked' | 'active' | 'used' | 'revoked'
  createdTime: number
  startedTime: number | null
  endsTime: number | null
  endedTime: number | null
  pausedPaid: PausedPaid | null
  note: string | null
}

export type MembershipGrantResult = {
  grant: MembershipGrant
  // capped: the holding cap left nothing to give; kept as a used receipt.
  outcome: 'started' | 'banked' | 'duplicate' | 'capped'
  reason?: string
}

export type GrantSupporterRow = Pick<
  UserEntitlement,
  | 'entitlementId'
  | 'enabled'
  | 'expiresTime'
  | 'autoRenew'
  | 'grantedTime'
  | 'metadata'
> & {
  // PostgreSQL timestamps can carry more precision than a JavaScript Date.
  expiresTimeText?: string
}

function milliseconds(value: number, minimum = 0) {
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    throw new Error('Invalid membership milliseconds')
  return value
}

function endTime(grant: MembershipGrant) {
  if (grant.endsTime === null)
    throw new Error('Active membership grant has no end time')
  return milliseconds(grant.endsTime)
}

export function capGrantDuration(
  durationMs: number,
  grants: MembershipGrant[],
  now: number
) {
  milliseconds(now)
  milliseconds(durationMs, 1)
  let available = MAX_FREE_MEMBERSHIP_HELD_MS
  for (const grant of grants) {
    const held =
      grant.status === 'banked'
        ? milliseconds(grant.durationMs, 1)
        : grant.status === 'active'
        ? Math.max(0, endTime(grant) - now)
        : 0
    available = Math.max(0, available - held)
  }
  const awarded = Math.min(durationMs, available)
  return {
    durationMs: awarded,
    reductionNote:
      awarded < durationMs
        ? `Holding cap reduced ${durationMs} ms to ${awarded} ms.`
        : null,
  }
}

export function planGrantStart(
  row: GrantSupporterRow | null,
  grants: MembershipGrant[],
  now: number
) {
  milliseconds(now)
  if (
    grants.some((g) => g.status === 'active') ||
    row?.metadata?.membershipGrantId != null
  )
    return null
  if (row?.expiresTime !== undefined) milliseconds(row.expiresTime)
  const current = row && getSupporterEntitlement([row], now)
  const paidTier = TIER_ORDER.find(
    (tier) => SUPPORTER_TIERS[tier].id === row?.entitlementId
  )
  const eligible = grants.filter(
    (g) =>
      g.status === 'banked' &&
      (!current ||
        !paidTier ||
        SUPPORTER_TIERS[g.tier].order >= SUPPORTER_TIERS[paidTier].order)
  )
  eligible.sort(
    (a, b) =>
      SUPPORTER_TIERS[b.tier].order - SUPPORTER_TIERS[a.tier].order ||
      a.createdTime - b.createdTime ||
      a.id.length - b.id.length ||
      a.id.localeCompare(b.id)
  )
  const grant = eligible[0]
  if (!grant) return null
  // A membership with no end date can't be set aside and resumed, so the
  // grant waits in the bank. Prod had no such rows on 25 Nov 2026.
  if (row && row.expiresTime === undefined) return null
  const pausedPaid: PausedPaid | null =
    row && paidTier && row.expiresTime !== undefined
      ? {
          rail: 'mana',
          tier: paidTier,
          remainingMs: row.expiresTime - now,
          lapsedExpiresTime:
            !row.autoRenew && row.expiresTime <= now
              ? row.expiresTimeText ?? new Date(row.expiresTime).toISOString()
              : undefined,
          autoRenew: row.autoRenew,
          enabled: row.enabled,
          grantedTime: row.grantedTime,
          metadata: row.metadata,
        }
      : null
  const newRow: GrantSupporterRow = {
    entitlementId: SUPPORTER_TIERS[grant.tier].id,
    enabled: true,
    autoRenew: false,
    grantedTime: row?.grantedTime ?? now,
    expiresTime: milliseconds(now + milliseconds(grant.durationMs, 1)),
    metadata: { membershipGrantId: grant.id },
  }
  return { grant, newRow, pausedPaid }
}

export function planGrantEnd(
  grant: MembershipGrant,
  now: number,
  early = false
): { newRow: GrantSupporterRow | null } | null {
  if (
    grant.status !== 'active' ||
    (milliseconds(now) < endTime(grant) && !early)
  )
    return null
  const paid = grant.pausedPaid
  return {
    newRow: paid
      ? {
          entitlementId: SUPPORTER_TIERS[paid.tier].id,
          enabled: paid.enabled ?? true,
          autoRenew: paid.autoRenew,
          grantedTime: paid.grantedTime,
          metadata: paid.metadata,
          expiresTime: milliseconds(
            paid.lapsedExpiresTime === undefined
              ? now + milliseconds(paid.remainingMs, Number.MIN_SAFE_INTEGER)
              : Date.parse(paid.lapsedExpiresTime)
          ),
        }
      : null,
  }
}

export type GrantTransitionMode = 'advance' | 'end-active'

// A single instant for the end and next start keeps paused milliseconds intact,
// even when the scheduler is late. Only the final supporter row is written.
export function planGrantTransition(
  row: GrantSupporterRow | null,
  grants: MembershipGrant[],
  now: number,
  mode: GrantTransitionMode = 'advance',
  startsDisabled = false
) {
  const active = grants.find((g) => g.status === 'active')
  if (String(row?.metadata?.membershipGrantId ?? '') !== (active?.id ?? ''))
    throw new Error('Membership grant and supporter row disagree')
  const end = active && planGrantEnd(active, now, mode === 'end-active')
  if (active && !end) return { ended: null, start: null, restored: null }
  const restored = end ? end.newRow : row
  if (mode === 'end-active' || startsDisabled)
    return { ended: active ?? null, start: null, restored }
  const start = planGrantStart(
    restored,
    grants.filter((g) => g !== active),
    now
  )
  if (start && active) {
    start.pausedPaid = active.pausedPaid
    start.newRow.grantedTime = row?.grantedTime ?? now
  }
  return { ended: active ?? null, start, restored }
}

export function getMembershipGrantView(
  row: GrantSupporterRow | null,
  grants: MembershipGrant[],
  now: number,
  startsDisabled = false
) {
  const active = grants.find((g) => g.status === 'active')
  const paused = active?.pausedPaid
  const endsTime = active ? endTime(active) : now
  const transition =
    active &&
    planGrantTransition(row, grants, endsTime, 'advance', startsDisabled)
  const restored = transition?.restored
  const next = transition?.start
    ? { kind: 'free' as const, tier: transition.start.grant.tier }
    : paused &&
      restored?.autoRenew &&
      restored.expiresTime !== undefined &&
      restored.expiresTime <= endsTime
    ? { kind: 'renewal' as const, tier: paused.tier }
    : paused && restored && getSupporterEntitlement([restored], endsTime)
    ? { kind: 'paid' as const, tier: paused.tier }
    : null
  return {
    next,
    active: active
      ? {
          id: active.id,
          tier: active.tier,
          endsTime,
          source: active.source,
        }
      : null,
    paid: paused
      ? {
          tier: paused.tier,
          daysLeft: Math.max(0, Math.ceil(paused.remainingMs / DAY_MS)),
          autoRenew: paused.autoRenew,
        }
      : null,
    banked: grants
      .filter((g) => g.status === 'banked')
      .map((g) => ({
        id: g.id,
        tier: g.tier,
        days: milliseconds(g.durationMs, 1) / DAY_MS,
        reason: startsDisabled
          ? 'Free membership starts are temporarily paused.'
          : active
          ? 'Waiting for the current free days to end.'
          : planGrantStart(row, [g], now)
          ? 'Ready to start.'
          : row && row.expiresTime === undefined
          ? 'Starts when your current membership ends.'
          : `Starts when your membership is ${
              SUPPORTER_TIERS[g.tier].name
            } or lower.`,
      })),
    isLocked: !!active,
  }
}

export type MembershipGrantView = ReturnType<typeof getMembershipGrantView>

export function nextMembershipMessage(
  next: NonNullable<MembershipGrantView['next']>
) {
  const name = SUPPORTER_TIERS[next.tier].name
  if (next.kind === 'free') return `Your banked free ${name} days start next.`
  if (next.kind === 'renewal')
    return `Your paid ${name} membership is then due for renewal.`
  return `Your paid ${name} membership resumes then.`
}

const membershipDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export const formatMembershipDate = (time: number) =>
  `${membershipDate.format(time)} PT`

export function membershipGrantLockMessage(
  tier: SupporterTier,
  endsTime: number,
  next?: MembershipGrantView['next']
) {
  const chain =
    next?.kind === 'free'
      ? `, then free ${SUPPORTER_TIERS[next.tier].name} days start`
      : ''
  return `You're using free ${
    SUPPORTER_TIERS[tier].name
  } days until ${formatMembershipDate(
    endsTime
  )}${chain}. You can change your membership once your free days end.`
}

// Both checkout surfaces and the charging transaction use the same credit calculation.
export function membershipChangeCredit(
  row: GrantSupporterRow | null | undefined,
  targetId: string,
  now: number
) {
  if (
    !row?.expiresTime ||
    row.metadata?.membershipGrantId != null ||
    row.entitlementId === targetId
  )
    return 0
  const tier = TIER_ORDER.find(
    (t) => SUPPORTER_TIERS[t].id === row.entitlementId
  )
  if (!tier) return 0
  const remaining = Math.max(
    0,
    milliseconds(row.expiresTime) - milliseconds(now)
  )
  const price = getShopItem(row.entitlementId)?.price ?? 0
  if (!Number.isFinite(price) || price < 0)
    throw new Error('Invalid membership price')
  return Math.floor((remaining / DAY_MS) * (price / 30))
}
