import _ from 'lodash'
import { Contract } from '../../lib/firebase/contracts'
import { Comment } from '../../lib/firebase/comments'
import { Bet } from 'common/bet'

const MAX_ACTIVE_CONTRACTS = 75

// This does NOT include comment times, since those aren't part of the contract atm.
// TODO: Maybe store last activity time directly in the contract?
// Pros: simplifies this code; cons: harder to tweak "activity" definition later
function lastActivityTime(contract: Contract) {
  return Math.max(contract.resolutionTime || 0, contract.createdTime)
}

// Types of activity to surface:
// - Comment on a market
// - New market created
// - Market resolved
// - Bet on market
export function findActiveContracts(
  allContracts: Contract[],
  recentComments: Comment[],
  recentBets: Bet[],
  seenContracts: { [contractId: string]: number }
) {
  const idToActivityTime = new Map<string, number>()
  function record(contractId: string, time: number) {
    // Only record if the time is newer
    const oldTime = idToActivityTime.get(contractId)
    idToActivityTime.set(contractId, Math.max(oldTime ?? 0, time))
  }

  const contractsById = new Map(allContracts.map((c) => [c.id, c]))

  // Record contract activity.
  for (const contract of allContracts) {
    record(contract.id, lastActivityTime(contract))
  }

  // Add every contract that had a recent comment, too
  for (const comment of recentComments) {
    const contract = contractsById.get(comment.contractId)
    if (contract) record(contract.id, comment.createdTime)
  }

  // Add contracts by last bet time.
  const contractBets = _.groupBy(recentBets, (bet) => bet.contractId)
  const contractMostRecentBet = _.mapValues(
    contractBets,
    (bets) => _.maxBy(bets, (bet) => bet.createdTime) as Bet
  )
  for (const bet of Object.values(contractMostRecentBet)) {
    const contract = contractsById.get(bet.contractId)
    if (contract) record(contract.id, bet.createdTime)
  }

  let activeContracts = allContracts.filter(
    (contract) =>
      contract.visibility === 'public' &&
      !contract.isResolved &&
      (contract.closeTime ?? Infinity) > Date.now()
  )
  activeContracts = _.sortBy(
    activeContracts,
    (c) => -(idToActivityTime.get(c.id) ?? 0)
  )

  const contractComments = _.groupBy(
    recentComments,
    (comment) => comment.contractId
  )
  const contractMostRecentComment = _.mapValues(
    contractComments,
    (comments) => _.maxBy(comments, (c) => c.createdTime) as Comment
  )

  const prioritizedContracts = _.sortBy(activeContracts, (c) => {
    const seenTime = seenContracts[c.id]
    if (!seenTime) {
      return 0
    }

    const lastCommentTime = contractMostRecentComment[c.id]?.createdTime
    if (lastCommentTime && lastCommentTime > seenTime) {
      return 1
    }

    const lastBetTime = contractMostRecentBet[c.id]?.createdTime
    if (lastBetTime && lastBetTime > seenTime) {
      return 2
    }

    return seenTime
  })

  return prioritizedContracts.slice(0, MAX_ACTIVE_CONTRACTS)
}
