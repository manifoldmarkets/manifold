import { Contract, MultiContract } from 'common/contract'
import { getContractFromSlug } from 'common/supabase/contracts'
import { useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { CandidateCard } from 'web/components/us-elections/contracts/candidate-card'
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
import { Spacer } from 'web/components/layout/spacer'
import { useTracking } from 'web/hooks/use-tracking'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'

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
  useSaveCampaign()
  useTracking('view elections')
  const user = useUser()
  useSaveReferral(user)

  const {
    mapContracts,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
  } = props
  const [targetContract, setTargetContract] = useState<
    Contract | undefined | null
  >(mapContracts.find((m) => m.state === 'GA')?.contract)

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

  if (
    !electionPartyContract ||
    !republicanCandidateContract ||
    !democratCandidateContract
  ) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="us elections page 2024">
      <Col className="gap-6 px-2 sm:gap-8 sm:px-4">
        <div className="text-primary-700 mt-4 inline-block text-2xl font-normal sm:mt-0 sm:text-3xl">
          US 2024 Elections
        </div>
        <PoliticsContractCard
          contract={electionPartyContract}
          barColor={'bg-canvas-0'}
        />
        <CandidateCard contract={electionCandidateContract as MultiContract} />
        <CandidateCard
          contract={republicanCandidateContract as MultiContract}
        />
        <CandidateCard contract={democratCandidateContract as MultiContract} />
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
            <div className=" h-[183px] w-full" />
          )}
        </Col>
      </Col>
      <Spacer h={4} />
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
