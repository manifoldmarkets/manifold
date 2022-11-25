import { createClient, PostgrestResponse } from '@supabase/supabase-js'

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

export async function run<T>(q: PromiseLike<PostgrestResponse<T>>) {
  const response = await q
  if (response.error != null) {
    throw response.error
  } else {
    return { data: response.data, count: response.count }
  }
}
