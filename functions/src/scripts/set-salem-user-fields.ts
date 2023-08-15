import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { User } from 'common/user'
import { Bet } from 'common/bet'
import { groupBy, sumBy } from 'lodash'

const firestore = admin.firestore()

async function setSalemUserFields() {
  console.log('Updating salem user fields')
  const users = await getValues<User>(firestore.collection('users'))

  console.log(`Loaded ${users.length} users. Calculating stuff...`)

  for (const [idx, user] of users.entries()) {
    console.log(`Querying user ${user.id} (${idx + 1}/${users.length})`)
    const bets = await getValues<Bet>(
      firestore.collectionGroup('bets').where('userId', '==', user.id)
    )
    const totalBets = bets.length

    const betsByContractId = groupBy(bets, 'contractId')
    const contractIdsWithMoreThan50Bet = Object.keys(betsByContractId).filter(
      (contractId) => {
        const bets = betsByContractId[contractId]
        const totalAmount = sumBy(bets, 'amount')
        return totalAmount >= 50
      }
    )
    const betMoreThanFiftyOnContractsCount = contractIdsWithMoreThan50Bet.length

    console.log(
      'got bets',
      totalBets,
      'betMoreThanFiftyOnContractsCount',
      betMoreThanFiftyOnContractsCount
    )
    await firestore.collection('users').doc(user.id).update({
      totalBets,
      betMoreThanFiftyOnContractsCount,
    })
  }

  console.log(`Finished.`)
}

if (require.main === module) {
  setSalemUserFields()
    .then(() => process.exit())
    .catch(console.log)
}
