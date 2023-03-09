import { Firestore, DocumentData } from 'firebase-admin/firestore'
import { log } from './utils'
import { bulkInsert } from 'shared/supabase/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'

export type WriteMessage<T extends DocumentData = DocumentData> = {
  ts: number
  eventId: string
  writeKind: string
  tableId: string
  path: string
  parentId: string
  docId: string
  data: T | null | undefined
}

export async function createFailedWrites(
  firestore: Firestore,
  ...entries: WriteMessage[]
) {
  const coll = firestore
    .collection('replicationState')
    .doc('supabase')
    .collection('failedWrites')
  const creator = firestore.bulkWriter({ throttling: false })
  for (const entry of entries) {
    creator.create(coll.doc(), entry)
  }
  await creator.close()
}

export async function replayFailedWrites(
  firestore: Firestore,
  supabase: SupabaseDirectClient,
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

  log('INFO', `Attempting to replay ${failedWrites.size} write(s)...`)
  const deleter = firestore.bulkWriter({ throttling: false })
  const entries = failedWrites.docs.map((d) => d.data() as WriteMessage)
  await replicateWrites(supabase, ...entries)
  for (const doc of failedWrites.docs) {
    deleter.delete(doc.ref)
  }
  await deleter.close()
  log('INFO', `Successfully replayed ${failedWrites.size} write(s).`)
  return failedWrites.size
}

export async function replicateWrites(
  pg: SupabaseDirectClient,
  ...entries: WriteMessage[]
) {
  return await bulkInsert(
    pg,
    'incoming_writes',
    entries.map((e) => ({
      event_id: e.eventId,
      table_id: e.tableId,
      write_kind: e.writeKind,
      parent_id: e.parentId,
      doc_id: e.docId,
      data: e.data,
      ts: new Date(e.ts).toISOString(),
    }))
  )
}
