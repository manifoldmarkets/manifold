import {
  capGrantDuration,
  getMembershipGrantView,
  GrantSupporterRow,
  GrantTransitionMode,
  MembershipGrant,
  MembershipGrantResult,
  PausedPaid,
  planGrantTransition,
} from 'common/membership-grants'
import {
  MembershipRenewal,
  publishMembershipRenewal,
  renewDueMembership,
} from './membership-renewal'
import { SupporterTier } from 'common/supporter-config'
import {
  SupabaseDirectClient,
  SupabaseDirectClientTimeout,
  SupabaseTransaction,
} from './supabase/init'
import { getSupporterRow, getUserEntitlements } from './supabase/entitlements'
import { transactWithRetries } from './transact-with-retries'
import { broadcastUpdatedUser } from './websockets/helpers'

type GrantRecord = Omit<
  MembershipGrant,
  'createdTime' | 'startedTime' | 'endsTime' | 'endedTime'
> & {
  createdTime: string
  startedTime: string | null
  endsTime: string | null
  endedTime: string | null
}

// int8 IDs must survive JSON and pg's lossy global int8 -> number parser.
const columns = `id::text, user_id as "userId", tier, duration_ms as "durationMs", source, source_id as "sourceId", status,
  created_time as "createdTime", started_time as "startedTime", ends_time as "endsTime",
  ended_time as "endedTime", paused_paid as "pausedPaid", note`
function convertGrant(g: GrantRecord): MembershipGrant {
  return {
    ...g,
    createdTime: Date.parse(g.createdTime),
    startedTime: g.startedTime === null ? null : Date.parse(g.startedTime),
    endsTime: g.endsTime === null ? null : Date.parse(g.endsTime),
    endedTime: g.endedTime === null ? null : Date.parse(g.endedTime),
  }
}

// PostgreSQL may report a unique violation when concurrent SERIALIZABLE
// transactions both see no row and insert the first entitlement/active grant.
const grantRetryOptions = {
  isRetryableError: (err: unknown) =>
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === '23505' &&
    'constraint' in err &&
    (err.constraint === 'membership_grants_one_active' ||
      err.constraint === 'user_entitlements_pkey'),
}

async function heldGrants(pg: SupabaseDirectClient, userId: string) {
  const rows = await pg.manyOrNone<GrantRecord>(
    `select ${columns} from membership_grants
    where user_id = $1 and status in ('active','banked') order by created_time, membership_grants.id`,
    [userId]
  )
  return rows.map(convertGrant)
}

export async function getActiveMembershipGrant(
  pg: SupabaseDirectClient,
  userId: string
) {
  const row = await pg.oneOrNone<GrantRecord>(
    `select ${columns} from membership_grants where user_id = $1 and status = 'active'`,
    [userId]
  )
  return row && convertGrant(row)
}

export async function readMembershipGrantView(
  tx: SupabaseTransaction,
  userId: string,
  now: number
) {
  return getMembershipGrantView(
    await getSupporterRow(tx, userId),
    await heldGrants(tx, userId),
    now
  )
}

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
  resume(
    tx: SupabaseTransaction,
    userId: string,
    swap: Swap
  ): Promise<MembershipRenewal | null>
}
const mana: MembershipBillingRail = {
  async pause(tx, userId, { previous, next, paid }) {
    await writeSupporterRow(tx, userId, previous, next)
    return paid
  },
  async resume(tx, userId, { previous, next, paid, now }) {
    await writeSupporterRow(tx, userId, previous, next, paid?.lapsedExpiresTime)
    return next?.autoRenew &&
      next.expiresTime !== undefined &&
      next.expiresTime <= now
      ? renewDueMembership(tx, userId, next.entitlementId, now)
      : null
  },
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
  const { ended, start, restored } = planGrantTransition(row, grants, now, mode)
  let renewal: MembershipRenewal | null = null
  const unservedMs =
    ended && mode === 'end-active' ? Math.max(0, ended.endsTime! - now) : 0
  if (ended && !unservedMs)
    await tx.one(
      `update membership_grants set status = 'used', ended_time = $2
    where id = $1 and status = 'active' returning id`,
      [ended.id, new Date(now)]
    )
  if (start) {
    const paid = await mana.pause(tx, userId, {
      previous: row,
      next: start.newRow,
      paid: start.pausedPaid,
      now,
    })
    await tx.one(
      `update membership_grants set status = 'active', started_time = $2, ends_time = $3, paused_paid = $4
      where id = $1 and status = 'banked' returning id`,
      [start.grant.id, new Date(now), new Date(start.newRow.expiresTime!), paid]
    )
  } else if (ended) {
    renewal = await mana.resume(tx, userId, {
      previous: row,
      next: restored,
      paid: ended.pausedPaid,
      now,
    })
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
  return { started: start?.grant.id ?? null, ended: ended?.id ?? null, renewal }
}

export async function processUserMembershipGrants(
  pg: SupabaseDirectClientTimeout,
  userId: string,
  mode: GrantTransitionMode = 'advance'
) {
  const { change, entitlements, renewal } = await transactWithRetries(
    pg,
    5,
    async (tx) => {
      const { renewal, ...change } = await advanceGrants(
        tx,
        userId,
        Date.now(),
        mode
      )
      const entitlements =
        change.started || change.ended
          ? await getUserEntitlements(tx, userId)
          : null
      return { change, entitlements, renewal }
    },
    grantRetryOptions
  )
  if (entitlements) broadcastUpdatedUser({ id: userId, entitlements })
  if (renewal) await publishMembershipRenewal(renewal)
  return change
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
  const { result, entitlements, renewal } = await transactWithRetries(
    pg,
    5,
    async (tx) => {
      const now = Date.now()
      const lookup = () =>
        tx.oneOrNone<GrantRecord>(
          `select ${columns} from membership_grants
      where user_id = $1 and source = $2 and source_id = $3`,
          [userId, source, sourceId]
        )
      const existing = await lookup()
      if (existing)
        return {
          result: {
            grant: convertGrant(existing),
            outcome: 'duplicate' as const,
          },
          entitlements: null,
          renewal: null,
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
        const record = await lookup()
        if (!record) throw new Error('Membership grant receipt missing')
        return {
          result: { grant: convertGrant(record), outcome: 'capped' as const },
          entitlements: null,
          renewal: null,
        }
      }
      const inserted = await tx.oneOrNone(
        `insert into membership_grants (user_id,tier,duration_ms,source,source_id,status,note)
      values ($1,$2,$3,$4,$5,'banked',$6) on conflict (user_id,source,source_id) do nothing returning id`,
        [userId, tier, durationMs, source, sourceId, note]
      )
      const change = inserted ? await advanceGrants(tx, userId, now) : null
      const record = await lookup()
      if (!record) throw new Error('Membership grant receipt missing')
      const grant = convertGrant(record)
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
        entitlements: inserted ? await getUserEntitlements(tx, userId) : null,
      }
    },
    grantRetryOptions
  )
  if (entitlements) broadcastUpdatedUser({ id: userId, entitlements })
  if (renewal) await publishMembershipRenewal(renewal)
  return result
}
