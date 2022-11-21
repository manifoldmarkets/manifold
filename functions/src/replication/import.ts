import * as admin from 'firebase-admin'
import { CollectionReference, CollectionGroup } from 'firebase-admin/firestore'
import { SupabaseClient } from '@supabase/supabase-js'

import { SupabaseTable } from './schema'
import { createSupabaseClient, recordUpsert } from './utils'
import { log, processPartitioned } from '../utils'
import { initAdmin } from '../scripts/script-init'

async function importCollection(
  client: SupabaseClient,
  source: CollectionReference,
  destination: SupabaseTable
) {
  log(`Populating ${destination}...`)
  const snaps = await source.get()
  log(`Loaded ${snaps.size} documents.`)
  await recordUpsert(client, destination, ...snaps.docs)
  log(`Imported ${snaps.size} documents.`)
}

async function importCollectionGroup(
  client: SupabaseClient,
  source: CollectionGroup,
  partitions: number,
  destination: SupabaseTable
) {
  log(`Populating ${destination}...`)
  await processPartitioned(source, partitions, async (snaps) => {
    await recordUpsert(client, destination, ...snaps)
  })
}

async function importDatabase() {
  const firestore = admin.firestore()
  const client = createSupabaseClient()
  if (client) {
    await importCollection(client, firestore.collection('txns'), 'txns')
    await importCollection(client, firestore.collection('groups'), 'groups')
    await importCollection(client, firestore.collection('users'), 'users')
    await importCollection(
      client,
      firestore.collection('contracts'),
      'contracts'
    )
    await importCollectionGroup(
      client,
      firestore.collectionGroup('bets'),
      100,
      'bets'
    )
    await importCollectionGroup(
      client,
      firestore.collectionGroup('comments'),
      10,
      'comments'
    )
  } else {
    throw new Error(
      'supabaseUrl and process.env.SUPABASE_ANON_KEY must be set.'
    )
  }
}

if (require.main === module) {
  initAdmin()
  importDatabase().then(() => {
    log('Finished importing.')
  })
}
