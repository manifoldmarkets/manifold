import { initAdmin } from 'shared/init-admin'
initAdmin()
import * as admin from 'firebase-admin'

import { DestinySub } from 'common/destiny-sub'
import { formatMoney } from 'common/util/format'

const firestore = admin.firestore()

// Deduct M1000 from totalDeposits from users with destiny sub purchases before: 1671304324034
async function fixDestinySubProfit() {
  const snap = await firestore
    .collection('destiny-subs')
    .where('createdTime', '<', 1671304324034)
    .get()

  const subs = snap.docs.map((doc) => doc.data() as DestinySub)

  for (const sub of subs) {
    console.log(
      'converting',
      sub.username,
      formatMoney(sub.cost),
      new Date(sub.createdTime).toISOString()
    )

    await firestore
      .collection('users')
      .doc(sub.userId)
      .update({
        totalDeposits: admin.firestore.FieldValue.increment(-sub.cost),
      })
  }
}

if (require.main === module) fixDestinySubProfit().then(() => process.exit())
