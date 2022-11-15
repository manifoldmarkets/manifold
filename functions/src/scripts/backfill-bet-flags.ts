// We used to allow bets to leave off the bet type flags, but that makes it hard to
// query on them in Firestore, so let's fill them in.

import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'
import { log } from '../utils'

initAdmin()
const firestore = admin.firestore()

async function updateAllBets() {
  log(`Loading bets...`)
  const writer = firestore.bulkWriter({ throttling: false })
  const flags = ['isAnte', 'isRedemption', 'isChallenge']
  const betsQuery = firestore.collectionGroup('bets').select(...flags)
  const betSnaps = await betsQuery.get()
  log(`Loaded ${betSnaps.size} bets.`)
  let updated = 0
  for (const doc of betSnaps.docs) {
    let needsUpdate = false
    const update: { [k: string]: boolean } = {}
    for (const flag of flags) {
      const currVal = doc.get(flag) as boolean | undefined
      if (currVal == null) {
        needsUpdate = true
        update[flag] = false
      }
    }
    if (needsUpdate) {
      updated++
      writer.update(doc.ref, update)
    }
  }
  log('Committing writes...')
  await writer.close()
  return updated
}

if (require.main === module) {
  updateAllBets().then((n) => log(`Updated ${n} bets.`))
}
