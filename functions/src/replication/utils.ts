import {
  createClient,
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClientOptions,
} from '@supabase/supabase-js'

import { DEV_CONFIG } from '../../../common/envs/dev'
import { PROD_CONFIG } from '../../../common/envs/prod'
import { isProd } from '../utils'

type QueryResponse = PostgrestResponse<any> | PostgrestSingleResponse<any>

export function createSupabaseClient(opts?: SupabaseClientOptions<'public'>) {
  const url =
    process.env.SUPABASE_URL ??
    (isProd() ? PROD_CONFIG.supabaseUrl : DEV_CONFIG.supabaseUrl)
  if (!url) {
    throw new Error(
      "Can't connect to Supabase; no process.env.SUPABASE_URL and no supabaseUrl in config."
    )
  }
  const key = process.env.SUPABASE_KEY
  if (!key) {
    throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.")
  }
  return createClient(url, key, opts)
}

export async function run<T extends QueryResponse = QueryResponse>(
  q: PromiseLike<T>
) {
  const response = await q
  if (response.error != null) {
    throw response.error
  } else {
    return { data: response.data, count: response.count }
  }
}
