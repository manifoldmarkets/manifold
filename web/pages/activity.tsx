import _ from 'lodash'
import {
  ActivityItem,
  ContractFeed,
  getContractFeedItems,
} from '../components/contract-feed'
import { Page } from '../components/page'
import { Contract } from '../lib/firebase/contracts'
import { Comment } from '../lib/firebase/comments'
import { Col } from '../components/layout/col'
import { Bet } from '../../common/bet'

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
  const topTradedContracts = _.sortBy(
    _.toPairs(contractTotalBets),
    ([_, total]) => -1 * total
  )
    .map(([id]) => contractsById.get(id) as Contract)
    .slice(0, MAX_HOT_MARKETS)

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

export function getActivity(
  contracts: Contract[],
  contractBets: Bet[][],
  contractComments: Comment[][]
) {
  const contractActivityItems = contracts.map((contract, i) => {
    const bets = contractBets[i]
    const comments = contractComments[i]
    return getContractFeedItems(contract, bets, comments, undefined, {
      expanded: false,
      feedType: 'activity',
    })
  })

  const hotMarketTimes: { [contractId: string]: number } = {}

  // Add recent top-trading contracts, ordered by last bet.
  const DAY_IN_MS = 24 * 60 * 60 * 1000
  const contractTotalBets = _.map(contractBets, (bets) => {
    const recentBets = bets.filter(
      (bet) => bet.createdTime > Date.now() - DAY_IN_MS
    )
    return _.sumBy(recentBets, (bet) => bet.amount)
  })
  const topTradedContracts = _.sortBy(
    contractTotalBets.map((total, index) => [total, index] as [number, number]),
    ([total, _]) => -1 * total
  ).slice(0, MAX_HOT_MARKETS)

  for (const [_total, index] of topTradedContracts) {
    const lastBet = _.last(contractBets[index])
    if (lastBet) {
      hotMarketTimes[contracts[index].id] = lastBet.createdTime
    }
  }

  const orderedContracts = _.sortBy(
    contracts.map((c, index) => [c, index] as const),
    ([contract, index]) => {
      const activeTypes = ['start', 'comment', 'close', 'resolve']
      const { createdTime } = _.last(
        contractActivityItems[index].filter((item) =>
          activeTypes.includes(item.type)
        )
      ) as ActivityItem
      const activeTime = createdTime ?? 0
      const hotTime = hotMarketTimes[contract.id] ?? 0
      return -1 * Math.max(activeTime, hotTime)
    }
  )

  return {
    contracts: orderedContracts.map(([_, index]) => contracts[index]),
    contractActivityItems: orderedContracts.map(
      ([_, index]) => contractActivityItems[index]
    ),
  }
}

export function ActivityFeed(props: {
  contracts: Contract[]
  contractActivityItems: ActivityItem[][]
}) {
  const { contracts, contractActivityItems } = props

  return contracts.length > 0 ? (
    <Col className="items-center">
      <Col className="w-full max-w-3xl">
        <Col className="w-full bg-white self-center divide-gray-300 divide-y">
          {contracts.map((contract, i) => {
            return (
              <div key={contract.id} className="py-6 px-2 sm:px-4">
                <ContractFeed
                  contract={contract}
                  activityItems={contractActivityItems[i]}
                  feedType="activity"
                />
              </div>
            )
          })}
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
      <ActivityFeed contracts={[]} contractActivityItems={[]} />
    </Page>
  )
}
