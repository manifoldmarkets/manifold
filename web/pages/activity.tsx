import _ from 'lodash'
import { ContractFeed } from '../components/contract-feed'
import { Page } from '../components/page'
import { Contract } from '../lib/firebase/contracts'
import { Comment } from '../lib/firebase/comments'
import { Col } from '../components/layout/col'
import { Bet } from '../../common/bet'
import { filterDefined } from '../../common/util/array'

const MAX_ACTIVE_CONTRACTS = 75
const MAX_HOT_MARKETS = 10

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
// - Markets with most betting in last 24 hours
export function findActiveContracts(
  allContracts: Contract[],
  recentComments: Comment[],
  recentBets: Bet[],
  daysAgo = 3
) {
  const idToActivityTime = new Map<string, number>()
  function record(contractId: string, time: number) {
    // Only record if the time is newer
    const oldTime = idToActivityTime.get(contractId)
    idToActivityTime.set(contractId, Math.max(oldTime ?? 0, time))
  }

  let contracts: Contract[] = []

  // Find contracts with activity in the last 3 days
  const DAY_IN_MS = 24 * 60 * 60 * 1000
  for (const contract of allContracts || []) {
    if (lastActivityTime(contract) > Date.now() - daysAgo * DAY_IN_MS) {
      contracts.push(contract)
      record(contract.id, lastActivityTime(contract))
    }
  }

  // Add every contract that had a recent comment, too
  const contractsById = new Map(allContracts.map((c) => [c.id, c]))
  for (const comment of recentComments) {
    const contract = contractsById.get(comment.contractId)
    if (contract) {
      contracts.push(contract)
      record(contract.id, comment.createdTime)
    }
  }

  // Add recent top-trading contracts, ordered by last bet.
  const contractBets = _.groupBy(recentBets, (bet) => bet.contractId)
  const contractTotalBets = _.mapValues(contractBets, (bets) =>
    _.sumBy(bets, (bet) => bet.amount)
  )
  const sortedPairs = _.sortBy(
    _.toPairs(contractTotalBets),
    ([_, total]) => -1 * total
  )
  const topTradedContracts = filterDefined(
    sortedPairs.map(([id]) => contractsById.get(id))
  ).slice(0, MAX_HOT_MARKETS)

  for (const contract of topTradedContracts) {
    const bet = recentBets.find((bet) => bet.contractId === contract.id)
    if (bet) {
      contracts.push(contract)
      record(contract.id, bet.createdTime)
    }
  }

  contracts = _.uniqBy(contracts, (c) => c.id)
  contracts = contracts.filter((contract) => contract.visibility === 'public')
  contracts = _.sortBy(contracts, (c) => -(idToActivityTime.get(c.id) ?? 0))
  return contracts.slice(0, MAX_ACTIVE_CONTRACTS)
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
        <Col className="w-full bg-white self-center divide-gray-300 divide-y">
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

export default function ActivityPage() {
  return (
    <Page>
      <ActivityFeed contracts={[]} contractBets={[]} contractComments={[]} />
    </Page>
  )
}
