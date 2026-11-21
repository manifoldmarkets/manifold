import {
  BDL_DEV_LEAGUE_REQUESTS_PER_MINUTE,
  BDL_REQUESTS_PER_MINUTE,
} from 'common/bdl/constants'
import type { BdlLeagueKey } from 'common/bdl/leagues'
import { MINUTE_MS } from 'common/util/time'
import { performance } from 'perf_hooks'
import type { SupabaseDirectClient } from '../supabase/init'

// A grant must be used promptly, even if the worker was paused waiting for SQL
// or a league switch. The same margin is included in the next worker's gap.
const PERMIT_MS = 2_000

export async function reserveDevBdlSlot(
  pg: SupabaseDirectClient,
  league: BdlLeagueKey
) {
  return pg.tx(async (tx) => {
    await tx.none("set local statement_timeout = '2s'")
    await tx.one(
      "select pg_advisory_xact_lock(hashtext('sports-bdl-dev-admission'))"
    )
    // Acquire no future reservations. Waiting callers keep no database connection.
    const { waitMs } = await tx.one<{ waitMs: number }>(
      `select greatest(0, ceil(extract(epoch from
          (max(next_request_at) - clock_timestamp())) * 1000))::integer as "waitMs"
         from sports_bdl_dev_request_slots where scope in ('global', $1)`,
      [league]
    )
    if (waitMs > 0) return waitMs
    await tx.none(
      `insert into sports_bdl_dev_request_slots (scope, next_request_at)
       select scope, clock_timestamp() + gap * interval '1 millisecond'
       from (values ('global', $2::integer), ($1, $3::integer)) as slots(scope, gap)
       on conflict (scope) do update set next_request_at = excluded.next_request_at`,
      [
        league,
        PERMIT_MS + Math.ceil(MINUTE_MS / BDL_REQUESTS_PER_MINUTE.dev),
        PERMIT_MS + Math.ceil(MINUTE_MS / BDL_DEV_LEAGUE_REQUESTS_PER_MINUTE),
      ]
    )
    return 0
  })
}

export async function sendDevBdlRequest<T>(
  league: BdlLeagueKey,
  isEnabled: () => Promise<boolean>,
  send: () => Promise<T>
): Promise<T> {
  const { createSupabaseDirectClient } = await import('../supabase/init')
  const pg = createSupabaseDirectClient()
  for (;;) {
    if (!(await isEnabled()))
      throw new Error('[sports-bdl-client] League disabled')
    const deadline = performance.now() + PERMIT_MS
    const waitMs = await reserveDevBdlSlot(pg, league)
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
      continue
    }
    if ((await isEnabled()) && performance.now() < deadline) return send()
  }
}
