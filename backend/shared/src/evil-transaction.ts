import * as admin from 'firebase-admin'
import { Transaction as FirebaseTransaction } from 'firebase-admin/firestore'
import {
  SupabaseTransaction,
  SERIAL,
  createShortTimeoutDirectClient,
} from 'shared/supabase/init'
import { log } from './utils'
import { acquireLock, releaseLock } from './firestore-lock'

/** Avoid using */
export const runEvilTransaction = async <T>(
  lockKey: string,
  callback: (
    pgTrans: SupabaseTransaction,
    fbTrans: FirebaseTransaction
  ) => Promise<T>
) => {
  const pg = createShortTimeoutDirectClient()
  let fbSuccess = false
  const acquired = await acquireLock(lockKey)
  if (!acquired) {
    throw new Error(`Error: Please try again! Failed to acquire lock ${lockKey}`)
  }
  try {
    return await pg.tx({ mode: SERIAL }, async (pgTrans) => {
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
  } finally {
    await releaseLock(lockKey)
  }
}

const firestore = admin.firestore()
