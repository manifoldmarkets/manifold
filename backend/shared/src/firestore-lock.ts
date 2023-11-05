import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { log } from 'shared/utils'
export async function acquire(id: string) {
  const fs = admin.firestore()
  const ref = fs.collection('locks').doc(id)
  try {
    await ref.create({ id, ts: FieldValue.serverTimestamp() })
    return true
  } catch {
    return false
  }
}

export async function release(id: string) {
  const fs = admin.firestore()
  const ref = fs.collection('locks').doc(id)
  try {
    await ref.delete()
    return true
  } catch { // it didn't exist
    console.warn(`Attempted to release lock ${id} which wasn't taken.`)
    return false
  }
}

// attempts to take the lock, and runs fn if successful; else do nothing
export async function runSingleton<T>(id: string, fn: () => Promise<T>) {
  const lock = await acquire(id)
  if (lock) {
    log(`Acquired lock ${id}. Running.`)
    try {
      return await fn()
    } finally {
      await release(id)
      log(`Released lock ${id}.`)
    }
  } else {
    log(`Failed to acquire lock ${id}. Not running.`)
    return null
  }
}
