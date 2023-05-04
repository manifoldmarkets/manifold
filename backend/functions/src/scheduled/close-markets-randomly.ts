import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { secrets } from 'common/secrets'
import { createSupabaseClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import Firestore = admin.firestore.Firestore

export const closeMarketsRandomly = functions
  .runWith({ secrets, memory: '4GB', timeoutSeconds: 540 })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    await closeMarketsInternal(admin.firestore())
  })

export async function closeMarketsInternal(firestore: Firestore) {
  const now = Date.now()
  const db = createSupabaseClient()
  const q = await db
    .from('public_contracts')
    .select('*')
    .eq('data->>isResolved', false)
    .lte('data->randomCloseAfterTime', now)
  if (q.error) throw q.error
  const contracts = q.data.map((d) => d.data as Contract)

  console.log(`Found ${contracts.length} contracts that need random close`)

  const needsRandomClose = contracts.filter((_) => Math.random() < 0.1)
  console.log(`Found ${needsRandomClose.length} contracts to close randomly`)
  needsRandomClose.map((c) => console.log(c.slug))
  await Promise.all(
    needsRandomClose.map(async (contract) =>
      firestore.doc(`contracts/${contract.id}`).update({
        closeTime: now,
      })
    )
  )
}
