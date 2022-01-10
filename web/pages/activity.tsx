import _ from 'lodash'
import { ContractFeed } from '../components/contract-feed'
import { Row } from '../components/layout/row'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { useRecentComments } from '../hooks/use-comments'
import { useContracts } from '../hooks/use-contracts'
import { Contract } from '../lib/firebase/contracts'
import { Comment } from '../lib/firebase/comments'

function FeedCard(props: { contract: Contract }) {
  const { contract } = props
  return (
    <div className="card bg-white shadow-md rounded-lg divide-y divide-gray-200 py-6 px-4 mb-4">
      <ContractFeed contract={contract} feedType="activity" />
    </div>
  )
}

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
function findActiveContracts(
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
  contracts = _.sortBy(contracts, (c) => -(idToActivityTime.get(c.id) ?? 0))
  return contracts
}

export default function ActivityPage() {
  const contracts = useContracts() || []
  const recentComments = useRecentComments() || []
  // TODO: Handle static props correctly?
  const activeContracts = findActiveContracts(contracts, recentComments)

  return (
    <Page>
      <Title text="Recent Activity" />
      {contracts ? (
        <Row className="gap-4">
          <div>
            {activeContracts.map((contract) => (
              <FeedCard contract={contract} />
            ))}
          </div>
        </Row>
      ) : (
        <></>
      )}
    </Page>
  )
}
