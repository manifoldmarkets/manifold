import * as admin from 'firebase-admin'
import {
  CollectionReference,
  CollectionGroup,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseClient, run } from './utils'
import { log, processPartitioned } from '../utils'
import { initAdmin } from '../scripts/script-init'
import { DocumentKind } from '../../../common/transaction-log'

// strategy for live importing collection C without dropping data (times are firestore server times)
// 1. optional - clear supabase table for collection C
// 2. start replication of new collection C transaction log entries to supabase starting at T0
// 3. establish import starting timestamp T1 such that T0 <= T1 <= now
// 4. read collection C from firestore with effective timestamp T1 and send supabase writes
// 5. supabase should be caught up

async function getServerTimestamp() {
  // firestore doesn't seem to have an API to just ask for the time, so we do this kludge
  const result = await admin.firestore().collection('temp').doc('time').get()
  return result.readTime.toDate()
}

function getWriteRow(
  snap: QueryDocumentSnapshot,
  docKind: DocumentKind,
  ts: Date
) {
  return {
    doc_kind: docKind,
    write_kind: 'create',
    doc_id: snap.id,
    data: snap.data(),
    ts: ts.toISOString(),
  }
}

async function importCollection(
  client: SupabaseClient,
  source: CollectionReference,
  docKind: DocumentKind
) {
  const t1 = await getServerTimestamp()
  log(`Import kind: ${docKind}. Effective timestamp: ${t1.toISOString()}.`)
  const snaps = await source.get()
  log(`Loaded ${snaps.size} documents.`)
  const rows = snaps.docs.map((d) => getWriteRow(d, docKind, t1))
  await run(client.from('incoming_writes').upsert(rows))
  log(`Imported ${snaps.size} documents.`)
}

async function importCollectionGroup(
  client: SupabaseClient,
  source: CollectionGroup,
  partitions: number,
  docKind: DocumentKind
) {
  const t1 = await getServerTimestamp()
  log(`Import kind: ${docKind}. Effective timestamp: ${t1.toISOString()}.`)
  await processPartitioned(source, partitions, async (docs) => {
    const rows = docs.map((d) => getWriteRow(d, docKind, t1))
    await run(client.from('incoming_writes').upsert(rows))
  })
}

async function importDatabase() {
  const firestore = admin.firestore()
  const client = createSupabaseClient()
  if (client) {
    await importCollection(client, firestore.collection('txns'), 'txn')
    await importCollection(client, firestore.collection('groups'), 'group')
    await importCollection(client, firestore.collection('users'), 'user')
    await importCollection(
      client,
      firestore.collection('contracts'),
      'contract'
    )
    await importCollectionGroup(
      client,
      firestore.collectionGroup('bets'),
      100,
      'contractBet'
    )
    await importCollectionGroup(
      client,
      firestore.collectionGroup('comments'),
      10,
      'contractComment'
    )
  } else {
    throw new Error('supabaseUrl and process.env.SUPABASE_KEY must be set.')
  }
}

if (require.main === module) {
  initAdmin()
  importDatabase()
    .then(() => {
      log('Finished importing.')
    })
    .catch((e) => {
      console.error(e)
    })
}
