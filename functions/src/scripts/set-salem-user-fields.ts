import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { User } from 'common/user'
import { Bet } from 'common/bet'
import { groupBy, sum, sumBy } from 'lodash'
import { getContractFromSlug } from '../create-contract'
import { filterDefined } from 'common/util/array'
import { getContractBetMetrics } from 'common/calculate'

const firestore = admin.firestore()

async function setSalemUserFields() {
  console.log('Updating salem user fields')
  const users = await getValues<User>(firestore.collection('users'))

  console.log(`Loaded ${users.length} users. Calculating stuff...`)

  const midtermContracts = filterDefined(
    await Promise.all(midtermMarketSlugs.map(getContractFromSlug))
  )
  console.log(
    'Got midterm contracts',
    midtermContracts.length,
    midtermContracts.map((c) => c.question)
  )

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
        const totalAmount = sum(bets.map((b) => Math.abs(b.amount)))
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

    const midtermProfit = sumBy(midtermContracts, (c) => {
      const { profit } = getContractBetMetrics(c, betsByContractId[c.id] ?? [])
      return profit
    })
    console.log(
      'midterm profit',
      midtermProfit,
      'total profit',
      user.profitCached.allTime
    )

    await firestore.collection('users').doc(user.id).update({
      totalBets,
      betMoreThanFiftyOnContractsCount,
      midtermProfit,
    })
  }

  console.log(`Finished.`)
}

if (require.main === module) {
  setSalemUserFields()
    .then(() => process.exit())
    .catch(console.log)
}

const midtermMarketSlugs = [
  'will-republicans-win-the-senate',
  'will-republicans-win-the-house-of-r',
  'will-republicans-win-the-senate-in',
  'will-republicans-win-the-senate-in-d755992df1b5',
  'will-republicans-win-michigan-3rd-d',
  'will-republicans-win-the-senate-in-836641ae8816',
  'will-republicans-win-the-senate-in-5dd0dba203a5',
  'another-polling-miss-in-the-midwest',
  'red-wave-in-november',
  'michigan-abortion-rights-landslide',
  'republican-governor-in-pa',
  'republican-governor-in-wisconsin',
  'republican-governor-in-illinois-mic',
  'democratic-governor-in-texas-or-flo',
  'will-republicans-win-the-senate-in-ef0f57fefe45',
  'republican-governor-in-arizona',
  'will-republicans-win-the-senate-in-a6310abce371',
  'republican-governor-in-oregon',
]
