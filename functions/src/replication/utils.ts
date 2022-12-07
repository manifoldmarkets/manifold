import {
  createClient,
  PostgrestResponse,
  PostgrestSingleResponse,
} from '@supabase/supabase-js'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import fetch, { RequestInfo, RequestInit } from 'node-fetch'

import { DEV_CONFIG } from '../../../common/envs/dev'
import { PROD_CONFIG } from '../../../common/envs/prod'
import { delay } from '../../../common/util/promise'
import { isProd } from '../utils'

type QueryResponse = PostgrestResponse<any> | PostgrestSingleResponse<any>

type RetryPolicy = {
  initialBackoffSec: number
  retries: number
}

const httpAgent = new HttpAgent({ keepAlive: true })
const httpsAgent = new HttpsAgent({ keepAlive: true })

const pooledFetch = (url: RequestInfo, options: RequestInit = {}) => {
  return fetch(url, {
    agent: (parsedURL) => {
      switch (parsedURL.protocol) {
        case 'http':
          return httpAgent
        case 'https':
          return httpsAgent
        default:
          return undefined
      }
    },
    ...options,
  })
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
  return createClient(url, key, { global: { fetch: pooledFetch as any } })
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
