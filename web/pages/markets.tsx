import {
  ContractsGrid,
  SearchableGrid,
} from 'web/components/contract/contracts-list'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { useContracts } from 'web/hooks/use-contracts'
import { Contract } from 'web/lib/firebase/contracts'

// TODO: Rename endpoint to "Explore"
export default function Markets() {
  const contracts = useContracts()

  return (
    <Page>
      <SEO
        title="Explore"
        description="Discover what's new, trending, or soon-to-close. Or search among our hundreds of markets."
        url="/markets"
      />
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
