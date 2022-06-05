import { Contract } from '../../lib/firebase/contracts'
import { User } from '../../lib/firebase/users'
import { Col } from '../layout/col'
import { SiteLink } from '../site-link'
import { ContractCard } from './contract-card'
import { ContractSearch } from '../contract-search'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { useEffect, useState } from 'react'

export function ContractsGrid(props: {
  contracts: Contract[]
  loadMore: () => void
  hasMore: boolean
  showCloseTime?: boolean
  onContractClick?: (contract: Contract) => void
}) {
  const { contracts, showCloseTime, hasMore, loadMore, onContractClick } = props

  const [elem, setElem] = useState<HTMLElement | null>(null)
  const isBottomVisible = useIsVisible(elem)

  useEffect(() => {
    if (isBottomVisible && hasMore) {
      loadMore()
    }
  }, [isBottomVisible, hasMore, loadMore])

  if (contracts.length === 0) {
    return (
      <p className="mx-2 text-gray-500">
        No markets found. Why not{' '}
        <SiteLink href="/create" className="font-bold text-gray-700">
          create one?
        </SiteLink>
      </p>
    )
  }

  return (
    <Col className="gap-8">
      <ul className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
        {contracts.map((contract) => (
          <ContractCard
            contract={contract}
            key={contract.id}
            showCloseTime={showCloseTime}
            onClick={() => onContractClick?.(contract)}
          />
        ))}
      </ul>
      <div ref={setElem} className="relative -top-96 h-1" />
    </Col>
  )
}

export function CreatorContractsList(props: { creator: User }) {
  const { creator } = props

  return (
    <ContractSearch
      querySortOptions={{
        defaultSort: 'newest',
        defaultFilter: 'all',
        shouldLoadFromStorage: false,
      }}
      additionalFilter={{
        creatorId: creator.id,
      }}
      showCategorySelector={false}
    />
  )
}
