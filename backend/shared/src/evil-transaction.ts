import * as admin from 'firebase-admin'
import { Transaction as FirebaseTransaction } from 'firebase-admin/firestore'
import {
  SupabaseTransaction,
  createSupabaseDirectClient,
  SERIAL,
} from 'shared/supabase/init'
import { log } from './utils'

/** Avoid using */
export const runEvilTransaction = async <T>(
  callback: (
    pgTrans: SupabaseTransaction,
    fbTrans: FirebaseTransaction
  ) => Promise<T>
) => {
  const pg = createSupabaseDirectClient()
  let fbSuccess = false
  try {
    return pg.tx({ mode: SERIAL }, async (pgTrans) => {
      const ret = await firestore.runTransaction(
        (fbTrans) => callback(pgTrans, fbTrans),
        { maxAttempts: 1 }
      )
      fbSuccess = true
      return ret
    })
  } catch (e) {
    if (fbSuccess) {
      log.error(
        'POSSIBLE MANA LEAK! firebase transaction succeeded but postgres transaction failed.  Must manually reconcile!'
      )
    }
    throw e
  }
}

const firestore = admin.firestore()
