import _ from 'lodash'
import { ContractFeed, ContractSummaryFeed } from '../components/contract-feed'
import { Page } from '../components/page'
import { Contract } from '../lib/firebase/contracts'
import { Comment } from '../lib/firebase/comments'
import { Col } from '../components/layout/col'
import { Bet } from '../../common/bet'

const MAX_ACTIVE_CONTRACTS = 75

// This does NOT include comment times, since those aren't part of the contract atm.
// TODO: Maybe store last activity time directly in the contract?
// Pros: simplifies this code; cons: harder to tweak "activity" definition later
function lastActivityTime(contract: Contract) {
  return Math.max(
    contract.resolutionTime || 0,
    contract.lastUpdatedTime,
    contract.createdTime
  )
}

// Types of activity to surface:
// - Comment on a market
// - New market created
// - Market resolved
// - Bet on market
export function findActiveContracts(
  allContracts: Contract[],
  recentComments: Comment[],
  recentBets: Bet[]
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
    (contract) => contract.visibility === 'public' && !contract.isResolved
  )
  activeContracts = _.sortBy(
    activeContracts,
    (c) => -(idToActivityTime.get(c.id) ?? 0)
  )
  return activeContracts.slice(0, MAX_ACTIVE_CONTRACTS)
}

export function ActivityFeed(props: {
  contracts: Contract[]
  contractBets: Bet[][]
  contractComments: Comment[][]
}) {
  const { contracts, contractBets, contractComments } = props

  return contracts.length > 0 ? (
    <Col className="items-center">
      <Col className="w-full max-w-3xl">
        <Col className="w-full divide-y divide-gray-300 self-center bg-white">
          {contracts.map((contract, i) => (
            <div key={contract.id} className="py-6 px-2 sm:px-4">
              <ContractFeed
                contract={contract}
                bets={contractBets[i]}
                comments={contractComments[i]}
                feedType="activity"
              />
            </div>
          ))}
        </Col>
      </Col>
    </Col>
  ) : (
    <></>
  )
}

export function SummaryActivityFeed(props: { contracts: Contract[] }) {
  const { contracts } = props

  return (
    <Col className="items-center">
      <Col className="w-full max-w-3xl">
        <Col className="w-full divide-y divide-gray-300 self-center bg-white">
          {contracts.map((contract) => (
            <div key={contract.id} className="py-6 px-2 sm:px-4">
              <ContractSummaryFeed contract={contract} />
            </div>
          ))}
        </Col>
      </Col>
    </Col>
  )
}

export default function ActivityPage() {
  return (
    <Page>
      <ActivityFeed contracts={[]} contractBets={[]} contractComments={[]} />
    </Page>
  )
}
