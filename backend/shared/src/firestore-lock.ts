import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { log } from 'shared/utils'

export async function acquire(id: string) {
  const fs = admin.firestore()
  const ref = fs.collection('locks').doc(id)
  try {
    await ref.create({ id, ts: FieldValue.serverTimestamp() })
    log(`Acquired lock ${id}.`)
    return true
  } catch {2
    log(`Failed to acquire lock ${id}.`)
    return false
  }
}

export async function release(id: string) {
  const fs = admin.firestore()
  const ref = fs.collection('locks').doc(id)
  try {
    await ref.delete()
    log(`Released lock ${id}.`)
    return true
  } catch { // it didn't exist
    log(`Attempted to release lock ${id} which wasn't taken.`)
    return false
  }
}

// attempts to take the lock, and runs fn if successful; else do nothing
export async function runSingleton<T>(id: string, fn: () => Promise<T>) {
  const lock = await acquire(id)
  if (lock) {
    // SIGTERM is sent by GCP when it terminates stuff (e.g. timeout)
    const onTerminated = () => release(id).then(() => process.exit(0))
    process.on('SIGINT', onTerminated)
    process.on('SIGTERM', onTerminated)
    try {
      return await fn()
    } finally {
      await release(id)
    }
  } else {
    return null
  }
}
