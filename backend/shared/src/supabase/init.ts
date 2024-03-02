import * as pgPromise from 'pg-promise'
import { createClient } from 'common/supabase/utils'
export { SupabaseClient } from 'common/supabase/utils'
import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import { gLog, isProd } from '../utils'
import { IDatabase } from 'pg-promise'
import { IClient } from 'pg-promise/typescript/pg-subset'
import { HOUR_MS } from 'common/util/time'

export const pgp = pgPromise({
  error(err: any, e: pgPromise.IEventContext) {
    // Read more: https://node-postgres.com/apis/pool#error
    gLog('ERROR', 'pgPromise background error', {
      error: err,
      event: e,
    })
  },
})
// Note: Bigint is not === numeric, so e.g. 0::bigint === 0 is false, but 0::bigint == 0n is true. See more: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt
pgp.pg.types.setTypeParser(20, BigInt) // Type Id 20 = BIGINT | BIGSERIAL
pgp.pg.types.setTypeParser(1700, parseFloat) // Type Id 1700 = NUMERIC

export type SupabaseDirectClient = ReturnType<typeof createSupabaseDirectClient>

export function createSupabaseClient() {
  const instanceId =
    process.env.SUPABASE_INSTANCE_ID ??
    (isProd() ? PROD_CONFIG.supabaseInstanceId : DEV_CONFIG.supabaseInstanceId)
  if (!instanceId) {
    throw new Error(
      "Can't connect to Supabase; no process.env.SUPABASE_INSTANCE_ID and no instance ID in config."
    )
  }
  const key = process.env.SUPABASE_KEY
  if (!key) {
    throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.")
  }

  // mqp - note that if you want to pass autoRefreshToken: true, you MUST call
  // `client.auth.stopAutoRefresh` on the client when you are done or it will
  // leak the refresh interval!

  return createClient(instanceId, key, { auth: { autoRefreshToken: false } })
}

// Use one connection to avoid WARNING: Creating a duplicate database object for the same connection.
let pgpDirect: IDatabase<IClient> | null = null
export function createSupabaseDirectClient(
  instanceId?: string,
  password?: string
) {
  if (pgpDirect) return pgpDirect
  instanceId =
    instanceId ??
    process.env.SUPABASE_INSTANCE_ID ??
    (isProd() ? PROD_CONFIG.supabaseInstanceId : DEV_CONFIG.supabaseInstanceId)
  if (!instanceId) {
    throw new Error(
      "Can't connect to Supabase; no process.env.SUPABASE_INSTANCE_ID and no instance ID in config."
    )
  }
  password = password ?? process.env.SUPABASE_PASSWORD
  if (!password) {
    throw new Error(
      "Can't connect to Supabase; no process.env.SUPABASE_PASSWORD."
    )
  }
  pgpDirect = pgp({
    host: `db.${getInstanceHostname(instanceId)}`,
    port: 5432,
    user: `postgres`,
    password: password,
    query_timeout: HOUR_MS, // mqp: debugging scheduled job behavior
    max: 20,
  })
  return pgpDirect
}
function getInstanceHostname(instanceId: string) {
  return `${instanceId}.supabase.co`
}
