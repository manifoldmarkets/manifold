import {
  ContractsGrid,
  SearchableGrid,
} from '../components/contract/contracts-list'
import { Page } from '../components/page'
import { SEO } from '../components/SEO'
import { Title } from '../components/title'
import { useContracts } from '../hooks/use-contracts'
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

      <SearchableGrid contracts={contracts} />
    </Page>
  )
}

export const HotMarkets = (props: { contracts: Contract[] }) => {
  const { contracts } = props
  if (contracts.length === 0) return <></>

  return (
    <div className="w-full rounded-lg border-2 border-indigo-100 bg-indigo-50 p-6 shadow-md">
      <Title className="!mt-0" text="🔥 Markets" />
      <ContractsGrid contracts={contracts} showHotVolume />
    </div>
  )
}

export const ClosingSoonMarkets = (props: { contracts: Contract[] }) => {
  const { contracts } = props
  if (contracts.length === 0) return <></>

  return (
    <div className="w-full rounded-lg border-2 border-green-100 bg-green-50 p-6 shadow-md">
      <Title className="!mt-0" text="⏰ Closing soon" />
      <ContractsGrid contracts={contracts} showCloseTime />
    </div>
  )
}
