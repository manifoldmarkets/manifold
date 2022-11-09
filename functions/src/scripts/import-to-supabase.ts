import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'
import { SupabaseClient } from '@supabase/supabase-js'
import { groupBy } from 'lodash'

initAdmin()
const firestore = admin.firestore()

import { Bet } from '../../../common/bet'
import { log, createSupabaseClient, formatPostgrestError } from '../utils'

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

if (require.main === module) {
  const betsQuery = firestore.collectionGroup('bets')
  log('Fetching bets...')
  betsQuery.get().then(async (betSnaps) => {
    const dbClient = createSupabaseClient()
    log(`Importing ${betSnaps.size} bets...`)
    if (dbClient != null) {
      return await recordBetUpsert(
        dbClient,
        betSnaps.docs.map((doc) => doc.data() as Bet)
      )
    } else {
      throw new Error(
        'supabaseUrl and process.env.SUPABASE_ANON_KEY must be set.'
      )
    }
  })
}
