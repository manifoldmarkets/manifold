import {
  getMembershipGrantView,
  MembershipGrant,
} from 'common/membership-grants'
import { SupabaseDirectClient, SupabaseTransaction } from './init'
import { getSupporterRow } from './entitlements'

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
const grantColumns = `id::text, user_id as "userId", tier, duration_ms as "durationMs", source, source_id as "sourceId", status,
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

export async function heldGrants(pg: SupabaseDirectClient, userId: string) {
  const rows = await pg.manyOrNone<GrantRecord>(
    `select ${grantColumns} from membership_grants
    where user_id = $1 and status in ('active','banked') order by created_time, membership_grants.id`,
    [userId]
  )
  return rows.map(convertGrant)
}

export async function getMembershipGrantBySource(
  tx: SupabaseTransaction,
  userId: string,
  source: string,
  sourceId: string
) {
  const row = await tx.oneOrNone<GrantRecord>(
    `select ${grantColumns} from membership_grants
     where user_id = $1 and source = $2 and source_id = $3`,
    [userId, source, sourceId]
  )
  return row && convertGrant(row)
}

export async function getActiveMembershipGrant(
  pg: SupabaseDirectClient,
  userId: string
) {
  const row = await pg.oneOrNone<GrantRecord>(
    `select ${grantColumns} from membership_grants where user_id = $1 and status = 'active'`,
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
