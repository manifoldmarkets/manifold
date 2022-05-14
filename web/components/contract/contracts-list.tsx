import { Contract } from '../../lib/firebase/contracts'
import { User } from '../../lib/firebase/users'
import { Col } from '../layout/col'
import { SiteLink } from '../site-link'
import { ContractCard } from './contract-card'
import { ContractSearch } from '../contract-search'

export function ContractsGrid(props: {
  contracts: Contract[]
  loadMore: () => void
  hasMore: boolean
  showCloseTime?: boolean
}) {
  const { contracts, showCloseTime, hasMore, loadMore } = props

  if (contracts.length === 0) {
    return (
      <p className="mx-2 text-gray-500">
        No markets found. Why not{' '}
        <SiteLink href="/home" className="font-bold text-gray-700">
          create one?
        </SiteLink>
      </p>
    )
  }

  return (
    <Col className="gap-8">
      <ul className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
        {contracts.map((contract) => (
          <ContractCard
            contract={contract}
            key={contract.id}
            showCloseTime={showCloseTime}
          />
        ))}
      </ul>
      {hasMore && (
        <button
          className="btn btn-primary self-center normal-case"
          onClick={loadMore}
        >
          Show more
        </button>
      )}
    </Col>
  )
}

export function CreatorContractsList(props: { creator: User }) {
  const { creator } = props

  return (
    <ContractSearch
      querySortOptions={{
        filter: {
          creatorId: creator.id,
        },
        defaultSort: 'newest',
        defaultFilter: 'all',
        shouldLoadFromStorage: false,
      }}
    />
  )
}
