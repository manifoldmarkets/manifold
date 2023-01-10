import * as admin from 'firebase-admin'
import {
  CollectionReference,
  CollectionGroup,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { chunk } from 'lodash'

import { withRetries } from '../../../common/util/promise'
import { run, SupabaseClient } from '../../../common/supabase/utils'
import { createSupabaseClient, log, processPartitioned } from '../utils'
import { initAdmin } from '../scripts/script-init'
import { DocumentKind } from '../../../common/transaction-log'
import { DAY_MS } from 'common/util/time'

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
    parent_id: snap.ref.parent.parent?.id,
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
async function importCollectionGroupAtTimestamp(
  client: SupabaseClient,
  source: CollectionGroup,
  docKind: DocumentKind,
  predicate: (d: QueryDocumentSnapshot) => boolean,
  startTime = 0,
  timePropName = 'createdTime'
) {
  log(`Preparing to import ${docKind} documents.`)
  const t1 = await getServerTimestamp()
  const n = (await source.count().get()).data().count
  if (startTime === 0) {
    startTime = await source.orderBy(timePropName, 'asc').limit(1).get().then((snap) => {
      return snap.docs[0].data()[timePropName]
    })
  }
  log(`Documents to import: ${n}. Timestamp: ${t1.toISOString()}. Starting from: ${startTime}.`)
  // go from startTime to t1 via 1 day chunks
  const delta = 1 * DAY_MS
  while (startTime < t1.getTime()) {
    const endTime = Math.min(startTime + delta, t1.getTime())
    const snap = await source
      .where(timePropName, '>=', startTime)
      .where(timePropName, '<', endTime)
      .get()
    log(`Loaded ${snap.size} documents.`)
    for (const batch of chunk(snap.docs, 2000)) {
      const rows = batch.map((d) => getWriteRow(d, docKind, t1))
      await withRetries(run(client.from('incoming_writes').insert(rows)))
    }
    log(`Processed ${snap.size} documents from ${startTime} to ${endTime}`)
    startTime = endTime
  }
}

async function clearFailedWrites() {
  const firestore = admin.firestore()
  log('Clearing failed writes...')
  const refs = await firestore
    .collection('replicationState')
    .doc('supabase')
    .collection('failedWrites')
    .listDocuments()
  const deleter = firestore.bulkWriter({ throttling: false })
  for (const ref of refs) {
    deleter.delete(ref)
  }
  await deleter.close()
}

async function importDatabase(kinds?: string[]) {
  const firestore = admin.firestore()
  const client = createSupabaseClient()
  const shouldImport = (k: DocumentKind) => kinds == null || kinds.includes(k)

  if (kinds == null) {
    await clearFailedWrites()
  }

  if (shouldImport('user'))
    await importCollection(client, firestore.collection('users'), 'user', 500)
  if (shouldImport('userPortfolioHistory'))
    await importCollectionGroupAtTimestamp(
      client,
      firestore.collectionGroup('portfolioHistory'),
      'userPortfolioHistory',
      (_) => true,
      0,
      'timestamp'
    )
  if (shouldImport('userContractMetrics'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('contract-metrics'),
      'userContractMetrics',
      (_) => true,
      2500,
    )
  if (shouldImport('userFollow'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('follows'),
      'userFollow',
      (c) => c.ref.parent.parent?.parent.path === 'users',
      5000
    )
  if (shouldImport('userReaction'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('reactions'),
      'userReaction',
      (_) => true,
      2500
    )
  if (shouldImport('userEvent'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('events'),
      'userEvent',
      (c) => c.ref.parent.parent?.parent.path === 'users',
      2500
    )
  if (shouldImport('userSeenMarket'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('seenMarkets'),
      'userSeenMarket',
      (_) => true,
      2500
    )
  if (shouldImport('contract'))
    await importCollection(
      client,
      firestore.collection('contracts'),
      'contract',
      500
    )
  if (shouldImport('contractAnswer'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('answers'),
      'contractAnswer',
      (_) => true,
      2500
    )
  if (shouldImport('contractBet'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('bets'),
      'contractBet',
      (_) => true,
      2500
    )
  if (shouldImport('contractComment'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('comments'),
      'contractComment',
      (c) => c.get('commentType') === 'contract',
      500
    )
  if (shouldImport('contractFollow'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('follows'),
      'contractFollow',
      (c) => c.ref.parent.parent?.parent.path == 'contracts',
      5000
    )
  if (shouldImport('contractLiquidity'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('liquidity'),
      'contractLiquidity',
      (_) => true,
      2500
    )
  if (shouldImport('group'))
    await importCollection(client, firestore.collection('groups'), 'group', 500)
  if (shouldImport('groupContract'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('groupContracts'),
      'groupContract',
      (_) => true,
      5000
    )
  if (shouldImport('groupMember'))
    await importCollectionGroup(
      client,
      firestore.collectionGroup('groupMembers'),
      'groupMember',
      (_) => true,
      5000
    )
  if (shouldImport('txn'))
    await importCollection(client, firestore.collection('txns'), 'txn', 2500)
  if (shouldImport('manalink'))
    await importCollection(
      client,
      firestore.collection('manalinks'),
      'manalink',
      2500
    )
  if (shouldImport('post'))
    await importCollection(client, firestore.collection('posts'), 'post', 100)
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
