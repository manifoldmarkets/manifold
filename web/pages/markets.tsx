import _ from 'lodash'
import { ContractsGrid, SearchableGrid } from '../components/contracts-list'
import { Spacer } from '../components/layout/spacer'
import { Page } from '../components/page'
import { Title } from '../components/title'
import { useContracts, useHotContracts } from '../hooks/use-contracts'
import { useQueryAndSortParams } from '../hooks/use-sort-and-query-params'
import {
  Contract,
  getHotContracts,
  listAllContracts,
} from '../lib/firebase/contracts'

export async function getStaticProps() {
  const [contracts, hotContractIds] = await Promise.all([
    listAllContracts().catch((_) => []),
    getHotContracts().catch(() => []),
  ])

  return {
    props: {
      contracts,
      hotContractIds,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export default function Markets(props: {
  contracts: Contract[]
  hotContractIds: string[]
}) {
  const contracts = useContracts()
  const { query, setQuery, sort, setSort } = useQueryAndSortParams()
  const hotContractIds = useHotContracts()

  const readyHotContractIds =
    hotContractIds === 'loading' ? props.hotContractIds : hotContractIds
  const readyContracts = contracts === 'loading' ? props.contracts : contracts

  const hotContracts = readyHotContractIds
    .map(
      (hotId) =>
        _.find(readyContracts, (contract) => contract.id === hotId) as Contract
    )
    .filter((contract) => !contract.isResolved)
    .slice(0, 4)

  return (
    <Page>
      <div className="w-full bg-indigo-50 border-2 border-indigo-100 p-6 rounded-lg shadow-md">
        <Title className="mt-0" text="🔥 Markets" />
        <ContractsGrid contracts={hotContracts} />
      </div>

      <Spacer h={10} />

      {(props.contracts || contracts !== 'loading') && (
        <SearchableGrid
          contracts={readyContracts}
          query={query}
          setQuery={setQuery}
          sort={sort}
          setSort={setSort}
        />
      )}
    </Page>
  )
}
