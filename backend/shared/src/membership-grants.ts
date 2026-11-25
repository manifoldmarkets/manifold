import {
  capGrantDuration,
  GrantTransitionMode,
  MembershipGrantResult,
  planGrantTransition,
} from 'common/membership-grants'
import {
  MembershipRenewal,
  publishMembershipRenewal,
  renewDueMembership,
} from './membership-renewal'
import { SupporterTier } from 'common/supporter-config'
import {
  SupabaseDirectClientTimeout,
  SupabaseTransaction,
} from './supabase/init'
import { getSupporterRow, getUserEntitlements } from './supabase/entitlements'
import { transactWithRetries } from './transact-with-retries'
import { broadcastUpdatedUser } from './websockets/helpers'
import {
  getMembershipGrantBySource,
  heldGrants,
  readMembershipGrantView,
} from './supabase/membership-grants'
import { startMembershipGrant, mana } from './membership-grant-start'
import { membershipGrantStartsDisabled } from './membership-grant-config'
import {
  ExpiryNoticeDelivery,
  publishExpiryNotice,
  writeTransitionExpiryNotice,
} from './membership-expiry-notice'

export {
  getActiveMembershipGrant,
  readMembershipGrantView,
} from './supabase/membership-grants'
export type { MembershipBillingRail } from './membership-grant-start'

// PostgreSQL may report a unique violation when concurrent SERIALIZABLE
// transactions both see no row and insert the first entitlement/active grant.
export const grantRetryOptions = {
  isRetryableError: (err: unknown) =>
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === '23505' &&
    'constraint' in err &&
    (err.constraint === 'membership_grants_one_active' ||
      err.constraint === 'user_entitlements_pkey'),
}

// Called only inside a retried SERIALIZABLE transaction.
async function advanceGrants(
  tx: SupabaseTransaction,
  userId: string,
  now: number,
  mode: GrantTransitionMode = 'advance'
) {
  const row = await getSupporterRow(tx, userId, true)
  const grants = await heldGrants(tx, userId)
  const { ended, start, restored } = planGrantTransition(
    row,
    grants,
    now,
    mode,
    await membershipGrantStartsDisabled(tx)
  )
  let renewal: MembershipRenewal | null = null
  let notice: ExpiryNoticeDelivery = null
  const unservedMs =
    ended && mode === 'end-active' ? Math.max(0, ended.endsTime! - now) : 0
  if (ended && !unservedMs)
    await tx.one(
      `update membership_grants set status = 'used', ended_time = $2
    where id = $1 and status = 'active' returning id`,
      [ended.id, new Date(now)]
    )
  if (start) {
    const started = await startMembershipGrant(tx, userId, row, start, now)
    notice = started.notice
  } else if (ended) {
    await mana.resume(tx, userId, {
      previous: row,
      next: restored,
      paid: ended.pausedPaid,
      now,
    })
    if (
      restored?.autoRenew &&
      restored.expiresTime !== undefined &&
      restored.expiresTime <= now
    )
      renewal = await renewDueMembership(
        tx,
        userId,
        restored.entitlementId,
        now,
        mode
      )
    else if (restored)
      notice = await writeTransitionExpiryNotice(
        tx,
        userId,
        restored,
        null,
        now
      )
    if (unservedMs > 0)
      await tx.one(
        `update membership_grants set status = 'banked', duration_ms = $2,
        started_time = null, ends_time = null, ended_time = null, paused_paid = null,
        note = concat_ws(' ', note, $3)
        where id = $1 and status = 'active' returning id`,
        [
          ended.id,
          unservedMs,
          `Ended early at ${new Date(
            now
          ).toISOString()}. Re-banked ${unservedMs} ms.`,
        ]
      )
  }
  return {
    started: start?.grant.id ?? renewal?.grant?.id ?? null,
    ended: ended?.id ?? null,
    entitlements:
      (start || ended) && !renewal?.grant
        ? await getUserEntitlements(tx, userId)
        : null,
    renewal,
    notice,
  }
}

// A read or checkout only needs to advance the ledger if free access just ended.
export async function endDueMembershipGrant(
  tx: SupabaseTransaction,
  userId: string,
  now: number
) {
  const due = await tx.oneOrNone(
    `select 1 from membership_grants where user_id = $1 and status = 'active' and ends_time <= $2`,
    [userId, new Date(now)]
  )
  return due ? advanceGrants(tx, userId, now) : null
}

export async function publishGrantTransition(
  userId: string,
  { entitlements, renewal, notice }: Awaited<ReturnType<typeof advanceGrants>>
) {
  if (entitlements) broadcastUpdatedUser({ id: userId, entitlements })
  if (renewal) await publishMembershipRenewal(renewal)
  if (notice) await publishExpiryNotice(notice)
}

export async function processUserMembershipGrants(
  pg: SupabaseDirectClientTimeout,
  userId: string,
  mode: GrantTransitionMode = 'advance'
) {
  const change = await transactWithRetries(
    pg,
    5,
    (tx) => advanceGrants(tx, userId, Date.now(), mode),
    grantRetryOptions
  )
  await publishGrantTransition(userId, change)
  return { started: change.started, ended: change.ended }
}

export async function grantMembershipDays(
  pg: SupabaseDirectClientTimeout,
  input: {
    userId: string
    tier: SupporterTier
    durationMs: number
    source: string
    sourceId: string
    note?: string
  }
): Promise<MembershipGrantResult> {
  const { userId, tier, source, sourceId } = input
  const { result, entitlements, renewal, notice } = await transactWithRetries(
    pg,
    5,
    async (tx) => {
      const now = Date.now()
      const lookup = () =>
        getMembershipGrantBySource(tx, userId, source, sourceId)
      const existing = await lookup()
      if (existing)
        return {
          result: {
            grant: existing,
            outcome: 'duplicate' as const,
          },
          entitlements: null,
          renewal: null,
          notice: null,
        }
      const { durationMs, reductionNote } = capGrantDuration(
        input.durationMs,
        await heldGrants(tx, userId),
        now
      )
      const note = [input.note, reductionNote].filter(Boolean).join(' ') || null
      if (durationMs === 0) {
        // Nothing left under the cap: keep a used receipt so the source
        // can't grant again, and let the caller (e.g. a trophy claim) succeed.
        await tx.none(
          `insert into membership_grants (user_id,tier,duration_ms,source,source_id,status,note,ended_time)
        values ($1,$2,0,$3,$4,'used',$5,$6) on conflict (user_id,source,source_id) do nothing`,
          [userId, tier, source, sourceId, note, new Date(now)]
        )
        const grant = await lookup()
        if (!grant) throw new Error('Membership grant receipt missing')
        return {
          result: { grant, outcome: 'capped' as const },
          entitlements: null,
          renewal: null,
          notice: null,
        }
      }
      const inserted = await tx.oneOrNone(
        `insert into membership_grants (user_id,tier,duration_ms,source,source_id,status,note)
      values ($1,$2,$3,$4,$5,'banked',$6) on conflict (user_id,source,source_id) do nothing returning id`,
        [userId, tier, durationMs, source, sourceId, note]
      )
      const change = inserted ? await advanceGrants(tx, userId, now) : null
      const grant = await lookup()
      if (!grant) throw new Error('Membership grant receipt missing')
      const outcome: MembershipGrantResult['outcome'] = !inserted
        ? 'duplicate'
        : grant.status === 'active'
        ? 'started'
        : 'banked'
      const reason =
        outcome === 'banked'
          ? (await readMembershipGrantView(tx, userId, now)).banked.find(
              (g) => g.id === grant.id
            )?.reason
          : undefined
      return {
        result: { grant, outcome, reason },
        renewal: change?.renewal,
        notice: change?.notice,
        entitlements:
          inserted && !change?.renewal?.grant
            ? change?.entitlements ?? (await getUserEntitlements(tx, userId))
            : null,
      }
    },
    grantRetryOptions
  )
  if (entitlements) broadcastUpdatedUser({ id: userId, entitlements })
  if (renewal) await publishMembershipRenewal(renewal)
  if (notice) await publishExpiryNotice(notice)
  return result
}
