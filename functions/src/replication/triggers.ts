import * as functions from 'firebase-functions'
import { Change } from 'firebase-functions'
import { DocumentSnapshot } from 'firebase-admin/firestore'

import { SupabaseTable } from './schema'
import { createSupabaseClient, recordChange } from './utils'

function replicator(documentPath: string, table: SupabaseTable) {
  const handler = async (change: Change<DocumentSnapshot>) => {
    const client = createSupabaseClient()
    if (client) {
      recordChange(client, table, change)
    } else {
      console.warn("Couldn't connect to Supabase; not replicating write.")
    }
  }
  return functions
    .runWith({ secrets: ['SUPABASE_ANON_KEY'] })
    .firestore.document(documentPath)
    .onWrite(handler)
}

export const replicateTxns = replicator('txns/{g}', 'txns')
export const replicateGroups = replicator('groups/{g}', 'groups')
export const replicateUsers = replicator('users/{u}', 'users')
export const replicateContracts = replicator('contracts/{c}', 'contracts')
export const replicateBets = replicator('contracts/{c}/bets/{b}', 'bets')
export const replicateComments = replicator(
  'contracts/{ct}/comments/{co}',
  'comments'
)
