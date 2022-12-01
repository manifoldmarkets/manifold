import { createClient, PostgrestResponse } from '@supabase/supabase-js'

import { DEV_CONFIG } from '../../../common/envs/dev'
import { PROD_CONFIG } from '../../../common/envs/prod'
import { isProd } from '../utils'

export function createSupabaseClient() {
  const url = isProd() ? PROD_CONFIG.supabaseUrl : DEV_CONFIG.supabaseUrl
  if (!url) {
    throw new Error("Can't connect to Supabase; no supabaseUrl in config.")
  }
  const key = process.env.SUPABASE_KEY
  if (!key) {
    throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.")
  }
  return createClient(url, key)
}

export async function run<T>(q: PromiseLike<PostgrestResponse<T>>) {
  const response = await q
  if (response.error != null) {
    throw response.error
  } else {
    return { data: response.data, count: response.count }
  }
}
