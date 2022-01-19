import _ from 'lodash'
import { SearchableGrid } from '../components/contracts-list'
import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import { useContracts } from '../hooks/use-contracts'
import { useQueryAndSortParams } from '../hooks/use-sort-and-query-params'
import { Contract, listAllContracts } from '../lib/firebase/contracts'

export async function getStaticProps() {
  const contracts = await listAllContracts().catch((_) => {})

  return {
    props: {
      contracts,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export default function Markets(props: { contracts: Contract[] }) {
  const contracts = useContracts() ?? props.contracts
  const { query, setQuery, sort, setSort } = useQueryAndSortParams()

  return (
    <Page>
      <SEO
        title="Explore"
        description="Discover what's new, trending, or soon-to-close. Or search among our hundreds of markets."
        url="/markets"
      />
      <SearchableGrid
        contracts={contracts}
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
      />
    </Page>
  )
}
