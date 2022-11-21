import { Change } from 'firebase-functions'
import { DocumentSnapshot } from 'firebase-admin/firestore'
import { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseTable } from './schema'
import { createClient, PostgrestError } from '@supabase/supabase-js'

import { DEV_CONFIG } from '../../../common/envs/dev'
import { PROD_CONFIG } from '../../../common/envs/prod'
import { isProd } from '../utils'

export function createSupabaseClient() {
  const url = isProd() ? PROD_CONFIG.supabaseUrl : DEV_CONFIG.supabaseUrl
  const key = process.env.SUPABASE_KEY
  if (url == null || key == null) {
    return null
  } else {
    return createClient(url, key)
  }
}

export function formatPostgrestError(err: PostgrestError) {
  return `${err.code} ${err.message} - ${err.details} - ${err.hint}`
}

export async function recordDeletion(
  client: SupabaseClient,
  table: SupabaseTable,
  id: string
) {
  const { error } = await client.from(table).delete().eq('id', id)
  if (error != null) {
    throw new Error(formatPostgrestError(error))
  }
}

export async function recordUpsert(
  client: SupabaseClient,
  table: SupabaseTable,
  ...docs: DocumentSnapshot[]
) {
  const { error } = await client.from(table).upsert(
    docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }))
  )
  if (error != null) {
    throw new Error(formatPostgrestError(error))
  }
}

export async function recordChange(
  client: SupabaseClient,
  table: SupabaseTable,
  change: Change<DocumentSnapshot>
) {
  if (change.after.exists) {
    await recordUpsert(client, table, change.after)
  } else {
    await recordDeletion(client, table, change.before.id)
  }
}
