import fetch, { RequestInfo, RequestInit } from 'node-fetch'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import { TLEntry } from '../../common/transaction-log'
import { SupabaseClient, createClient } from '@supabase/supabase-js'
import { run } from '../../common/supabase/utils'

export function createSupabaseClient(url: string, key: string) {
  const customFetch = (agents: { [k: string]: HttpAgent }) => {
    return (url: RequestInfo, options: RequestInit = {}) => {
      return fetch(url, {
        agent: (parsedURL) => agents[parsedURL.protocol],
        ...options,
      })
    }
  }

  const httpAgent = new HttpAgent({ keepAlive: true })
  const httpsAgent = new HttpsAgent({ keepAlive: true })
  const pooledFetch = customFetch({ http: httpAgent, https: httpsAgent })
  return createClient(url, key, { global: { fetch: pooledFetch as any } })
}

export async function replicateWrites(
  client: SupabaseClient,
  ...entries: TLEntry[]
) {
  return await run(
    client.from('incoming_writes').insert(
      entries.map((e) => ({
        event_id: e.eventId,
        doc_kind: e.docKind,
        write_kind: e.writeKind,
        doc_id: e.docId,
        data: e.data,
        ts: new Date(e.ts).toISOString(),
      }))
    )
  )
}
