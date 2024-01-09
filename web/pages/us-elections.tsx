import { Contract } from 'common/contract'
import { ELECTION_ENABLED } from 'common/envs/constants'
import { getContractFromSlug } from 'common/supabase/contracts'
import { useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { PoliticsContractCard } from 'web/components/us-elections/contracts/politics-contract-card'
import { presidency2024 } from 'web/components/us-elections/usa-map/election-contract-data'
import { probToColor } from 'web/components/us-elections/usa-map/state-election-map'
import {
  ClickHandler,
  Customize,
  USAMap,
} from 'web/components/us-elections/usa-map/usa-map'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import Custom404 from './404'

export async function getStaticProps() {
  const adminDb = await initSupabaseAdmin()

  const mapContractsPromises = presidency2024.map((m) =>
    getContractFromSlug(m.slug, adminDb).then((contract) => {
      return { state: m.state, contract: contract }
    })
  )

  const electionPartyContract = await getContractFromSlug(
    'which-party-will-win-the-2024-us-pr-f4158bf9278a',
    adminDb
  )

  const electionCandidateContract = await getContractFromSlug(
    'who-will-win-the-2024-us-presidenti-8c1c8b2f8964',
    adminDb
  )

  const republicanCandidateContract = await getContractFromSlug(
    'who-will-win-the-2024-republican-pr-e1332cf40e59',
    adminDb
  )

  const democratCandidateContract = await getContractFromSlug(
    'who-will-win-the-2024-democratic-pr-47576e90fa38',
    adminDb
  )

  // Wait for all promises to resolve
  const mapContracts = await Promise.all(mapContractsPromises)

  return {
    props: {
      mapContracts: mapContracts,
      electionPartyContract: electionPartyContract,
      electionCandidateContract: electionCandidateContract,
      republicanCandidateContract: republicanCandidateContract,
      democratCandidateContract: democratCandidateContract,
    },
    revalidate: 60,
  }
}

export type MapContracts = { state: string; contract: Contract | null }

export default function USElectionsPage(props: {
  mapContracts: MapContracts[]
  electionPartyContract: Contract
  electionCandidateContract: Contract
  republicanCandidateContract: Contract
  democratCandidateContract: Contract
}) {
  const {
    mapContracts,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
  } = props
  const [targetContract, setTargetContract] = useState<
    Contract | undefined | null
  >(undefined)

  const [hoveredContract, setHoveredContract] = useState<
    Contract | undefined | null
  >(undefined)

  const stateContractMap: Customize = useMemo(() => {
    const map: Record<
      string,
      {
        fill: string
        clickHandler: ClickHandler
        onMouseEnter?: () => void
        onMouseLeave?: () => void
        selected: boolean
        hovered: boolean
      }
    > = {}
    mapContracts.forEach((mapContract) => {
      map[mapContract.state] = {
        fill: probToColor(mapContract.contract) ?? '#D6D1D3',
        clickHandler: () => {
          if (
            targetContract &&
            mapContract.contract?.id === targetContract.id
          ) {
            setTargetContract(undefined)
          } else {
            setTargetContract(mapContract.contract)
          }
        },
        onMouseEnter: () => {
          setHoveredContract(mapContract.contract)
        },
        onMouseLeave: () => {
          setHoveredContract(undefined)
        },
        selected:
          !!targetContract && targetContract?.id === mapContract.contract?.id,
        hovered:
          !!hoveredContract && hoveredContract?.id === mapContract.contract?.id,
      }
    })
    return map
  }, [mapContracts, targetContract])

  if (!ELECTION_ENABLED) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="us elections page 2024">
      <Col className="gap-3">
        <PoliticsContractCard contract={electionPartyContract} />
        <PoliticsContractCard contract={electionCandidateContract} />
        <PoliticsContractCard contract={republicanCandidateContract} />
        <PoliticsContractCard contract={democratCandidateContract} />
        <Col className="bg-canvas-0 rounded-xl p-4">
          <div className="mx-auto font-semibold sm:text-xl">
            Which party will win the US Presidency?
          </div>
          <USAMap customize={stateContractMap} />
          {hoveredContract || targetContract ? (
            <StateContract
              targetContract={(hoveredContract ?? targetContract) as Contract}
            />
          ) : (
            <div className="bg-canvas-100 h-[224px] w-full animate-pulse" />
          )}
        </Col>
      </Col>
    </Page>
  )
}

function StateContract(props: { targetContract: Contract }) {
  const { targetContract } = props
  return (
    <PoliticsContractCard
      contract={targetContract}
      customTitle={extractStateFromSentence(targetContract.question)}
      titleSize="lg"
    />
  )
}

function extractStateFromSentence(sentence: string): string | undefined {
  const regex = /US Presidency in ([\w\s,.()]+)\?/
  const match = sentence.match(regex)

  return match ? match[1].trim() : undefined
}
