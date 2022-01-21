import _ from 'lodash'
import { ContractFeed } from '../components/contract-feed'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { useRecentComments } from '../hooks/use-comments'
import { useContracts } from '../hooks/use-contracts'
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
export function findActiveContracts(
  allContracts: Contract[],
  recentComments: Comment[]
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
    if (lastActivityTime(contract) > Date.now() - 3 * DAY_IN_MS) {
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
  const { contractBets, contractComments } = props
  const contracts = useContracts() ?? props.contracts
  const recentComments = useRecentComments()
  const activeContracts = recentComments
    ? findActiveContracts(contracts, recentComments)
    : props.contracts

  return contracts.length > 0 ? (
    <Col className="items-center">
      <Col className="w-full max-w-3xl">
        <Col className="w-full bg-white self-center divide-gray-300 divide-y">
          {activeContracts.map((contract, i) => (
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
