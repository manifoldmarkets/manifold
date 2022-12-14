import * as admin from 'firebase-admin'
import {
  CollectionReference,
  CollectionGroup,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { SupabaseClient } from '@supabase/supabase-js'
import { chunk } from 'lodash'

import { withRetries } from '../../../common/util/promise'
import { run } from '../../../common/supabase/utils'
import { createSupabaseClient, log, processPartitioned } from '../utils'
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
  docKind: DocumentKind,
  batchSize: number
) {
  log(`Preparing to import ${docKind} documents.`)
  const t1 = await getServerTimestamp()
  const n = (await source.count().get()).data().count
  log(`Documents to import: ${n}. Timestamp: ${t1.toISOString()}.`)

  const snaps = await source.get()
  log(`Loaded ${snaps.size} documents.`)
  for (const batch of chunk(snaps.docs, batchSize)) {
    const rows = batch.map((d) => getWriteRow(d, docKind, t1))
    await withRetries(run(client.from('incoming_writes').insert(rows)))
    log(`Processed ${rows.length} documents.`)
  }
  log(`Imported ${snaps.size} documents.`)
}

async function importCollectionGroup(
  client: SupabaseClient,
  source: CollectionGroup,
  docKind: DocumentKind,
  predicate: (d: QueryDocumentSnapshot) => boolean,
  batchSize: number
) {
  log(`Preparing to import ${docKind} documents.`)
  const t1 = await getServerTimestamp()
  const n = (await source.count().get()).data().count
  log(`Documents to import: ${n}. Timestamp: ${t1.toISOString()}.`)

  // partitions are different sizes so be conservative
  const partitions = Math.ceil(n / batchSize) * 2
  await processPartitioned(source, partitions, async (docs) => {
    const rows = docs.filter(predicate).map((d) => getWriteRow(d, docKind, t1))
    await withRetries(run(client.from('incoming_writes').insert(rows)))
  })
}

async function importDatabase(kinds?: string[]) {
  const firestore = admin.firestore()
  const client = createSupabaseClient()
  const shouldImport = (k: DocumentKind) => kinds == null || kinds.includes(k)

  if (shouldImport('txn'))
    await importCollection(client, firestore.collection('txns'), 'txn', 1000)
  if (shouldImport('group'))
    await importCollection(client, firestore.collection('groups'), 'group', 100)
  if (shouldImport('user'))
    await importCollection(client, firestore.collection('users'), 'user', 100)
  if (shouldImport('contract'))
    await importCollection(
      client,
      firestore.collection('contracts'),
      'contract',
      100
    )
  if (shouldImport('contractBet'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('bets'),
      'contractBet',
      (_) => true,
      1000
    )
  if (shouldImport('contractComment'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('comments'),
      'contractComment',
      (c) => c.get('commentType') === 'contract',
      100
    )
}

if (require.main === module) {
  initAdmin()
  const args = process.argv.slice(2)
  importDatabase(args.length > 0 ? args : undefined)
    .then(() => {
      log('Finished importing.')
    })
    .catch((e) => {
      console.error(e)
    })
}
