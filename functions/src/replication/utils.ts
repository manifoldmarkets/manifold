import {
  createClient,
  PostgrestResponse,
  PostgrestSingleResponse,
} from '@supabase/supabase-js'

import { DEV_CONFIG } from '../../../common/envs/dev'
import { PROD_CONFIG } from '../../../common/envs/prod'
import { isProd } from '../utils'

type QueryResponse = PostgrestResponse<any> | PostgrestSingleResponse<any>

type RetryPolicy = {
  initialBackoffSec: number
  retries: number
}

export function createSupabaseClient() {
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
  return createClient(url, key)
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), ms))
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

export async function runWithRetries<T extends QueryResponse = QueryResponse>(
  q: PromiseLike<T>,
  policy?: RetryPolicy
) {
  let err: any
  let delaySec = policy?.initialBackoffSec ?? 5
  for (let i = 0; i < (policy?.retries ?? 5); i++) {
    try {
      return await run(q)
    } catch (e) {
      console.error(e)
      console.warn(`Error running query; retrying in ${delaySec} seconds.`)
      await delay(delaySec * 1000)
      delaySec *= 2
    }
  }
  throw err
}
