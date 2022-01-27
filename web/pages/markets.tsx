import { ContractsGrid, SearchableGrid } from '../components/contracts-list'
import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { useContracts } from '../hooks/use-contracts'
import { useQueryAndSortParams } from '../hooks/use-sort-and-query-params'
import { Contract, listAllContracts } from '../lib/firebase/contracts'

export async function getStaticProps() {
  const contracts = await listAllContracts().catch((_) => [])
  return {
    props: {
      contracts,
    },

    revalidate: 60, // regenerate after a minute
  }
}

// TODO: Rename endpoint to "Explore"
export default function Markets(props: { contracts: Contract[] }) {
  const contracts = useContracts() ?? props.contracts ?? []

  const { query, setQuery, sort, setSort } = useQueryAndSortParams({
    defaultSort: '24-hour-vol',
  })

  return (
    <Page>
      <SEO
        title="Explore"
        description="Discover what's new, trending, or soon-to-close. Or search among our hundreds of markets."
        url="/markets"
      />
      {/* <HotMarkets contracts={hotContracts} />
      <Spacer h={10} />
      <ClosingSoonMarkets contracts={closingSoonContracts} />
      <Spacer h={10} /> */}

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

export const HotMarkets = (props: { contracts: Contract[] }) => {
  const { contracts } = props
  if (contracts.length === 0) return <></>

  return (
    <div className="w-full bg-indigo-50 border-2 border-indigo-100 p-6 rounded-lg shadow-md">
      <Title className="!mt-0" text="🔥 Markets" />
      <ContractsGrid contracts={contracts} showHotVolume />
    </div>
  )
}

export const ClosingSoonMarkets = (props: { contracts: Contract[] }) => {
  const { contracts } = props
  if (contracts.length === 0) return <></>

  return (
    <div className="w-full bg-green-50 border-2 border-green-100 p-6 rounded-lg shadow-md">
      <Title className="!mt-0" text="⏰ Closing soon" />
      <ContractsGrid contracts={contracts} showCloseTime />
    </div>
  )
}
