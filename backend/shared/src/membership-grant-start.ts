import {
  GrantSupporterRow,
  PausedPaid,
  planGrantStart,
} from 'common/membership-grants'
import { getSupporterRow } from './supabase/entitlements'
import { heldGrants } from './supabase/membership-grants'
import { SupabaseTransaction } from './supabase/init'
import {
  writeExpiryNotice,
  nextMembershipExpiryScan,
} from './membership-expiry-notice'

async function writeSupporterRow(
  tx: SupabaseTransaction,
  userId: string,
  previous: GrantSupporterRow | null,
  next: GrantSupporterRow | null,
  exactExpiry?: string
) {
  if (!next) {
    if (previous)
      await tx.none(
        'delete from user_entitlements where user_id = $1 and entitlement_id = $2',
        [userId, previous.entitlementId]
      )
    return
  }
  const values = [
    userId,
    next.entitlementId,
    new Date(next.grantedTime),
    exactExpiry ?? new Date(next.expiresTime!),
    next.autoRenew,
    next.metadata ?? null,
    next.enabled,
  ]
  if (previous) {
    // Keep the original database timestamp (including its sub-ms precision).
    await tx.one(
      `update user_entitlements set entitlement_id = $2, enabled = $7,
      expires_time = $4, auto_renew = $5, metadata = $6 where user_id = $1 and entitlement_id = $8 returning entitlement_id`,
      [...values, previous.entitlementId]
    )
  } else {
    await tx.one(
      `insert into user_entitlements (user_id, entitlement_id, granted_time, expires_time, auto_renew, metadata, enabled)
      values ($1,$2,$3,$4,$5,$6,$7) returning entitlement_id`,
      values
    )
  }
}

// A Stripe rail must defer the next invoice for each grant (e.g. extend trial_end
// with proration_behavior: 'none'), keep Stripe IDs in private paused_paid, and sync
// on resume. Use idempotent post-commit work for remote calls. A webhook must
// update paused_paid while a grant owns the row, including during chained grants.
type Swap = {
  previous: GrantSupporterRow | null
  next: GrantSupporterRow | null
  paid: PausedPaid | null
  now: number
}
export interface MembershipBillingRail {
  pause(
    tx: SupabaseTransaction,
    userId: string,
    swap: Swap
  ): Promise<PausedPaid | null>
  resume(tx: SupabaseTransaction, userId: string, swap: Swap): Promise<void>
}
export const mana: MembershipBillingRail = {
  async pause(tx, userId, { previous, next, paid }) {
    await writeSupporterRow(tx, userId, previous, next)
    return paid
  },
  async resume(tx, userId, { previous, next, paid }) {
    await writeSupporterRow(tx, userId, previous, next, paid?.lapsedExpiresTime)
  },
}

export async function startMembershipGrant(
  tx: SupabaseTransaction,
  userId: string,
  previous: GrantSupporterRow | null,
  start: NonNullable<ReturnType<typeof planGrantStart>>,
  now: number
) {
  const { grant, newRow, pausedPaid } = start
  const endsTime = newRow.expiresTime!
  const paid = await mana.pause(tx, userId, {
    previous,
    next: newRow,
    paid: pausedPaid,
    now,
  })
  await tx.one(
    `update membership_grants set status = 'active', started_time = $2, ends_time = $3, paused_paid = $4
     where id = $1 and status = 'banked' returning id`,
    [grant.id, new Date(now), new Date(endsTime), paid]
  )
  // The scheduled scan only selects grants with strictly future expiries.
  const notice =
    endsTime <= nextMembershipExpiryScan(now)
      ? await writeExpiryNotice(
          tx,
          {
            user_id: userId,
            entitlement_id: newRow.entitlementId,
            expires_time: new Date(endsTime).toISOString(),
            auto_renew: false,
            grant_id: grant.id,
          },
          now
        )
      : null
  return { tier: grant.tier, endsTime, notice }
}

export async function getOrStartMembershipGrant(
  tx: SupabaseTransaction,
  userId: string,
  now: number
) {
  const grants = await heldGrants(tx, userId)
  if (!grants.length) return null
  const active = grants.find((grant) => grant.status === 'active')
  if (active)
    return {
      started: false,
      tier: active.tier,
      endsTime: active.endsTime!,
      notice: null,
    }
  const row = await getSupporterRow(tx, userId, true)
  const start = planGrantStart(row, grants, now)
  if (!start) return null
  return {
    started: true,
    ...(await startMembershipGrant(tx, userId, row, start, now)),
  }
}
