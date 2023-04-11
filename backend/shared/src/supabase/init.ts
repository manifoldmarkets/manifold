import * as pgPromise from 'pg-promise'
import { createClient, getInstanceHostname } from 'common/supabase/utils'
import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import { isProd } from '../utils'
import { IDatabase } from 'pg-promise'
import { IClient } from 'pg-promise/typescript/pg-subset'

export const pgp = pgPromise()

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
  return createClient(instanceId, key)
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
    user: 'postgres',
    password: password,
  })
  return pgpDirect
}
