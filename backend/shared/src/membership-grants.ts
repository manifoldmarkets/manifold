import {
  capGrantDuration,
  GrantTransitionMode,
  MembershipGrantMismatchError,
  MembershipGrantResult,
  originalPaidExpiry,
  planGrantTransition,
} from 'common/membership-grants'
import {
  broadcastMembershipRenewal,
  MembershipRenewal,
  notifyMembershipRenewal,
  renewDueMembership,
} from './membership-renewal'
import { SupporterTier } from 'common/supporter-config'
import {
  SupabaseDirectClientTimeout,
  SupabaseTransaction,
} from './supabase/init'
import { getSupporterRow, getUserEntitlements } from './supabase/entitlements'
import { transactWithRetries } from './transact-with-retries'
import { broadcastShopUserState } from './shop-broadcast'
import {
  getMembershipGrantBySource,
  heldGrants,
  readMembershipGrantView,
} from './supabase/membership-grants'
import { startMembershipGrant, mana } from './membership-grant-start'
import { canStartMembershipGrant } from './membership-grant-config'
import { log } from './monitoring/log'
import { betsQueue } from './helpers/fn-queue'
import {
  ExpiryNoticeDelivery,
  TransitionExpiryNotice,
  publishExpiryNotice,
  writeTransitionExpiryNotice,
} from './membership-expiry-notice'

export {
  getActiveMembershipGrant,
  readMembershipGrantView,
} from './supabase/membership-grants'
export type { MembershipBillingRail } from './membership-grant-start'

export async function readDbNowMsExact(tx: SupabaseTransaction) {
  const { now } = await tx.one<{ now: number }>(
    'select (extract(epoch from now()) * 1000)::float8 as now'
  )
  return Number(now)
}

export async function readDbNowMs(tx: SupabaseTransaction) {
  return Math.trunc(await readDbNowMsExact(tx))
}

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
export async function advanceGrants(
  tx: SupabaseTransaction,
  userId: string,
  now: number,
  {
    mode = 'advance',
    allowRowMismatch = false,
    deferExpiryNotices = false,
  }: {
    mode?: GrantTransitionMode
    allowRowMismatch?: boolean
    deferExpiryNotices?: boolean
  } = {}
) {
  const row = await getSupporterRow(tx, userId, true)
  const grants = await heldGrants(tx, userId)
  const startsDisabled =
    mode === 'advance' &&
    grants.some((g) => g.status === 'banked') &&
    !(await canStartMembershipGrant(tx))
  let plan: ReturnType<typeof planGrantTransition>
  try {
    plan = planGrantTransition(row, grants, now, mode, startsDisabled)
  } catch (error) {
    if (!allowRowMismatch || !(error instanceof MembershipGrantMismatchError))
      throw error
    log.error(error.message, { userId })
    // Non-membership checkout can still price against the current entitlement.
    plan = { ended: null, start: null, restored: row }
  }
  const { ended, start, restored } = plan
  let renewal: MembershipRenewal | null = null
  let notice: ExpiryNoticeDelivery = null
  const deferredNotices: TransitionExpiryNotice[] | undefined =
    deferExpiryNotices ? [] : undefined
  const unservedMs =
    ended && mode === 'end-active' ? Math.max(0, ended.endsTime! - now) : 0
  if (ended && !unservedMs)
    await tx.one(
      `update membership_grants set status = 'used', ended_time = $2
    where id = $1 and status = 'active' returning id`,
      [ended.id, new Date(now)]
    )
  if (start) {
    const started = await startMembershipGrant(
      tx,
      userId,
      row,
      start,
      now,
      deferredNotices
    )
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
        mode,
        ended.pausedPaid
          ? originalPaidExpiry(ended.pausedPaid, ended.startedTime!)
          : undefined,
        deferredNotices
      )
    else if (restored)
      notice = await writeTransitionExpiryNotice(
        tx,
        userId,
        restored,
        null,
        now,
        deferredNotices
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
    deferredNotices,
  }
}

// The owner view settles expired grants on read.
export async function hasDueMembershipGrant(
  tx: SupabaseTransaction,
  userId: string,
  now: number
) {
  const due = await tx.oneOrNone(
    `select 1 from membership_grants where user_id = $1 and status = 'active' and ends_time <= $2`,
    [userId, new Date(now)]
  )
  return !!due
}

type GrantTransitionUpdates = Pick<
  Awaited<ReturnType<typeof advanceGrants>>,
  'entitlements' | 'renewal' | 'notice'
>

export function broadcastGrantTransition(
  userId: string,
  { entitlements, renewal }: GrantTransitionUpdates
) {
  if (entitlements) broadcastShopUserState(userId, { entitlements })
  if (renewal) broadcastMembershipRenewal(renewal)
}

export async function notifyGrantTransition({
  renewal,
  notice,
}: GrantTransitionUpdates) {
  if (renewal) await notifyMembershipRenewal(renewal)
  if (notice) await publishExpiryNotice(notice)
}

// API entry points call this before taking any queue slot for the user.
export async function runQueuedGrantTransition<T>(
  userId: string,
  commit: () => Promise<{ result: T; change: GrantTransitionUpdates | null }>
) {
  const { result, change } = await betsQueue.enqueueFn(async () => {
    const committed = await commit()
    if (committed.change) broadcastGrantTransition(userId, committed.change)
    return committed
  }, [userId])
  if (change)
    void notifyGrantTransition(change).catch((error) =>
      log.error('Failed to publish membership grant notification', {
        userId,
        error,
      })
    )
  return result
}

export async function processUserMembershipGrants(
  pg: SupabaseDirectClientTimeout,
  userId: string,
  mode: GrantTransitionMode = 'advance',
  onChangeCommitted?: (userId: string) => void
) {
  const change = await transactWithRetries(
    pg,
    5,
    async (tx) => {
      const now = await readDbNowMs(tx)
      return advanceGrants(tx, userId, now, { mode })
    },
    grantRetryOptions
  )
  if (change.started || change.ended) onChangeCommitted?.(userId)
  broadcastGrantTransition(userId, change)
  await notifyGrantTransition(change)
  return { started: change.started, ended: change.ended }
}

type MembershipGrantInput = {
  userId: string
  tier: SupporterTier
  durationMs: number
  source: string
  sourceId: string
  note?: string
}

// Idempotent per (userId, source, sourceId). Takes the user's betsQueue slot
// so a renewal it settles broadcasts in order with checkouts: never call it
// from inside that user's slot (betsQueue isn't re-entrant; it would deadlock).
export function grantMembershipDays(
  pg: SupabaseDirectClientTimeout,
  input: MembershipGrantInput
): Promise<MembershipGrantResult> {
  return runQueuedGrantTransition<MembershipGrantResult>(input.userId, () =>
    commitMembershipDays(pg, input)
  )
}

function commitMembershipDays(
  pg: SupabaseDirectClientTimeout,
  input: MembershipGrantInput
) {
  const { userId, tier, source, sourceId } = input
  return transactWithRetries(
    pg,
    5,
    async (tx) => {
      const now = await readDbNowMs(tx)
      const lookup = () =>
        getMembershipGrantBySource(tx, userId, source, sourceId)
      const existing = await lookup()
      if (existing)
        return {
          result: {
            grant: existing,
            outcome: 'duplicate' as const,
          },
          change: null,
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
          change: null,
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
        change: change && {
          ...change,
          entitlements: change.renewal?.grant
            ? null
            : change.entitlements ?? (await getUserEntitlements(tx, userId)),
        },
      }
    },
    grantRetryOptions
  )
}
