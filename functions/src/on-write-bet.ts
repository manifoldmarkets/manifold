import * as functions from 'firebase-functions'
import { SupabaseClient } from '@supabase/supabase-js'

import { Bet } from '../../common/bet'
import { createSupabaseClient, formatPostgrestError } from './utils'

async function recordBetDeletion(client: SupabaseClient, betId: string) {
  const { error } = await client.from('bets').delete().eq('id', betId)
  if (error != null) {
    throw new Error(formatPostgrestError(error))
  }
}

async function recordBetUpsert(client: SupabaseClient, bet: Bet) {
  const { error } = await client.from('bets').upsert({
    id: bet.id,
    userId: bet.userId,
    contractId: bet.contractId,
    createdTime: bet.createdTime,
    amount: bet.amount,
    outcome: bet.outcome,
    probBefore: bet.probBefore,
    probAfter: bet.probAfter,
  })
  if (error != null) {
    throw new Error(formatPostgrestError(error))
  }
}

export const onWriteBet = functions
  .runWith({ secrets: ['SUPABASE_ANON_KEY'] })
  .firestore.document('contracts/{contractId}/bets/{betId}')
  .onWrite(async (change, _context) => {
    const dbClient = createSupabaseClient()
    if (dbClient != null) {
      if (!change.after.exists) {
        await recordBetDeletion(dbClient, change.before.id)
      } else {
        await recordBetUpsert(dbClient, change.after.data() as Bet)
      }
    }
  })
