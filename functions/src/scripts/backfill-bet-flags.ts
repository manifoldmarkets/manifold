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
  let updated = 0
  const betsPartitions = firestore.collectionGroup('bets').getPartitions(50)
  for await (const q of betsPartitions) {
    const betSnaps = await q.toQuery().get()
    log(`Loaded partition with ${betSnaps.size} bets.`)
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
  }
  log('Committing writes...')
  await writer.close()
  return updated
}

if (require.main === module) {
  updateAllBets().then((n) => log(`Updated ${n} bets.`))
}
