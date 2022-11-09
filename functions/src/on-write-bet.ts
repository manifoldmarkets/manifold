import * as functions from 'firebase-functions'
import {
  createClient,
  SupabaseClient,
  PostgrestError,
} from '@supabase/supabase-js'

import { DEV_CONFIG } from '../../common/envs/dev'
import { PROD_CONFIG } from '../../common/envs/prod'
import { Bet } from '../../common/bet'
import { isProd } from './utils'

function getSupabaseUrl() {
  return isProd() ? PROD_CONFIG.supabaseUrl : DEV_CONFIG.supabaseUrl
}

function formatPostgrestError(err: PostgrestError) {
  return `${err.code} ${err.message} - ${err.details} - ${err.hint}`
}

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
    const supabaseUrl = getSupabaseUrl()
    if (supabaseUrl != null) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const dbClient = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!)
      if (!change.after.exists) {
        await recordBetDeletion(dbClient, change.before.id)
      } else {
        await recordBetUpsert(dbClient, change.after.data() as Bet)
      }
    }
  })
