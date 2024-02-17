import {
  Firestore,
  CollectionReference,
  DocumentData,
} from 'firebase-admin/firestore'
import { log } from './utils'
import { bulkInsert } from 'shared/supabase/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

type WriteMetadata = {
  ts: number
  eventId: string
  writeKind: string
  tableId: string
  path: string
  parentId: string
  docId: string
}

export type WriteMessage<T extends DocumentData = DocumentData> = {
  data: T | null | undefined
} & WriteMetadata

// we can run into trouble writing arbitrary json into firestore because there
// is a max nesting limit of 20 levels in the server SDK, which tiptap stuff exceeds

export type FailedWriteDoc = { json: string } & WriteMetadata

function firestoreDocToMessage(docData: FailedWriteDoc): WriteMessage {
  const { json, ...rest } = docData
  return { data: JSON.parse(json), ...rest }
}

function messageToFirestoreDoc(message: WriteMessage): FailedWriteDoc {
  const { data, ...rest } = message
  return { json: JSON.stringify(data), ...rest }
}

export async function createFailedWrites(
  firestore: Firestore,
  ...entries: WriteMessage[]
) {
  const coll = firestore
    .collection('replicationState')
    .doc('supabase')
    .collection('failedWrites') as CollectionReference<FailedWriteDoc>
  const creator = new SafeBulkWriter({ throttling: false })
  for (const entry of entries) {
    creator.create(coll.doc(), messageToFirestoreDoc(entry))
  }
  await creator.close()
}

export async function replayFailedWrites(
  firestore: Firestore,
  supabase: SupabaseDirectClient,
  limit = 1000
) {
  const coll = firestore
    .collection('replicationState')
    .doc('supabase')
    .collection('failedWrites') as CollectionReference<FailedWriteDoc>
  const failedWrites = await coll.limit(limit).get()
  if (failedWrites.size == 0) {
    return 0
  }

  log('INFO', `Attempting to replay ${failedWrites.size} write(s)...`)
  const deleter = new SafeBulkWriter({ throttling: false })
  const entries = failedWrites.docs.map((d) => firestoreDocToMessage(d.data()))
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
