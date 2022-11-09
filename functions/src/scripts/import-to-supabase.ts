import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'
import { SupabaseClient } from '@supabase/supabase-js'
import { groupBy } from 'lodash'

initAdmin()
const firestore = admin.firestore()

import { Bet } from '../../../common/bet'
import { User } from '../../../common/user'
import { log, createSupabaseClient, formatPostgrestError } from '../utils'

async function recordUserUpsert(client: SupabaseClient, users: User[]) {
  const { error } = await client.from('users').upsert(
    users.map((user) => ({
      id: user.id,
      name: user.name,
    }))
  )
  if (error != null) {
    throw new Error(formatPostgrestError(error))
  }
}

async function recordBetUpsert(client: SupabaseClient, bets: Bet[]) {
  const uniquifiedBets = groupBy(bets, (b) => b.id)

  const { error } = await client.from('bets').upsert(
    Object.entries(uniquifiedBets).map(([_id, [bet, ..._rest]]) => ({
      id: bet.id,
      userId: bet.userId,
      contractId: bet.contractId,
      createdTime: bet.createdTime,
      amount: bet.amount,
      outcome: bet.outcome ?? null,
      probBefore: bet.probBefore ?? null,
      probAfter: bet.probAfter ?? null,
    }))
  )
  if (error != null) {
    throw new Error(formatPostgrestError(error))
  }
}

async function importStuff(dbClient: SupabaseClient) {
  log('Fetching users...')
  const userSnaps = await firestore.collection('users').get()
  log(`Importing ${userSnaps.size} users...`)
  await recordUserUpsert(
    dbClient,
    userSnaps.docs.map((doc) => doc.data() as User)
  )
  log('Fetching bets...')
  const betSnaps = await firestore.collectionGroup('bets').get()
  log(`Importing ${betSnaps.size} bets...`)
  await recordBetUpsert(
    dbClient,
    betSnaps.docs.map((doc) => doc.data() as Bet)
  )
}

if (require.main === module) {
  const dbClient = createSupabaseClient()
  if (dbClient == null) {
    throw new Error(
      'supabaseUrl and process.env.SUPABASE_ANON_KEY must be set.'
    )
  }
  importStuff(dbClient)
}
