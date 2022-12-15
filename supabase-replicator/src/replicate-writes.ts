import { Firestore } from 'firebase-admin/firestore'
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

export async function replayFailedWrites(
  firestore: Firestore,
  supabase: SupabaseClient,
  limit = 1000
) {
  const failedWrites = await firestore
    .collection('replicationState')
    .doc('supabase')
    .collection('failedWrites')
    .limit(limit)
    .get()
  if (failedWrites.size == 0) {
    return 0
  }

  console.log(`Attempting to replay ${failedWrites.size} write(s)...`)
  const deleter = firestore.bulkWriter({ throttling: false })
  const entries = failedWrites.docs.map((d) => d.data() as TLEntry)
  await replicateWrites(supabase, ...entries)
  for (const doc of failedWrites.docs) {
    deleter.delete(doc.ref)
  }
  await deleter.close()
  console.log(`Successfully replayed ${failedWrites.size} write(s).`)
  return failedWrites.size
}

export async function replicateWrites(
  supabase: SupabaseClient,
  ...entries: TLEntry[]
) {
  return await run(
    supabase.from('incoming_writes').insert(
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
