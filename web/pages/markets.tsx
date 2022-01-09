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
  const [contracts, hotContracts] = await Promise.all([
    listAllContracts().catch((_) => []),
    getHotContracts().catch(() => []),
  ])

  return {
    props: {
      contracts,
      hotContracts,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export default function Markets(props: {
  contracts: Contract[]
  hotContracts: Contract[]
}) {
  const contracts = useContracts()
  const hotContracts = useHotContracts()
  const { query, setQuery, sort, setSort } = useQueryAndSortParams()

  const readyHotContracts = hotContracts ?? props.hotContracts
  const readyContracts = contracts === 'loading' ? props.contracts : contracts

  return (
    <Page>
      <div className="w-full bg-indigo-50 border-2 border-indigo-100 p-6 rounded-lg shadow-md">
        <Title className="mt-0" text="🔥 Markets" />
        <ContractsGrid contracts={readyHotContracts} />
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
