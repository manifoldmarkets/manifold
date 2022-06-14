// import * as functions from 'firebase-functions'
// import * as admin from 'firebase-admin'
// import { groupBy, sum, sumBy } from 'lodash'
//
// import { getValues, log, logMemory, mapAsync } from './utils'
// import { Contract } from '../../common/contract'
// import { Bet } from '../../common/bet'
// import { User } from '../../common/user'
// import { calculatePayout } from '../../common/calculate'
//
// const firestore = admin.firestore()
//
// const computeInvestmentValue = (
//   bets: Bet[],
//   contractsDict: { [k: string]: Contract }
// ) => {
//   return sumBy(bets, (bet) => {
//     const contract = contractsDict[bet.contractId]
//     if (!contract || contract.isResolved) return 0
//     if (bet.sale || bet.isSold) return 0
//
//     const payout = calculatePayout(contract, bet, 'MKT')
//     return payout - (bet.loanAmount ?? 0)
//   })
// }
//
// const computeTotalPool = (
//   user: User,
//   contractsDict: { [k: string]: Contract }
// ) => {
//   const creatorContracts = Object.values(contractsDict).filter(
//     (contract) => contract.creatorId === user.id
//   )
//   const pools = creatorContracts.map((contract) =>
//     sum(Object.values(contract.pool))
//   )
//   return sum(pools)
// }
//
// export const updateGroupMetricsCore = async () => {
//   const [users, contracts, groups, bets] = await Promise.all([
//     getValues<User>(firestore.collection('users')),
//     getValues<Contract>(firestore.collection('contracts')),
//     // getValues<Group>(firestore.collection('groups')),
//     firestore.collectionGroup('bets').get(),
//   ])
//   log(
//     `Loaded ${users.length} users, ${contracts.length} contracts, and ${bets.docs.length} bets.`
//   )
//   logMemory()
//
//   // loop through tags, get contract  ids for that tag, compute pnl for those contracts by user
//
//   const betsByUser = groupBy(
//     bets.docs.map((doc) => doc.data() as Bet),
//     (bet) => bet.userId
//   )
//   for (const group of groups) {
//     // for each tag, get only contracts with that tag
//     const contractsDict = Object.fromEntries(
//       contracts
//         .filter((contract) => group.contractIds.includes(contract.id))
//         .map((contract) => [contract.id, contract])
//     )
//
//     await mapAsync(users, async (user) => {
//       const investmentValue = computeInvestmentValue(
//         betsByUser[user.id] ?? [],
//         contractsDict
//       )
//       const creatorPools = computeTotalPool(user, contractsDict)
//       const totalValue = user.balance + investmentValue
//       const totalPnL = totalValue - user.totalDeposits
//       return await firestore.collection(`groups/${group}`).doc(user.id).update({
//         totalPnLCached: totalPnL,
//         creatorPoolCached: creatorPools,
//       })
//     })
//   }
//
//   log(`Updated metrics for ${groups.length} tags.`)
// }
//
// export const updateTagMetrics = functions
//   .runWith({ memory: '1GB' })
//   .pubsub.schedule('every 1 minutes')
//   .onRun(updateGroupMetricsCore)
