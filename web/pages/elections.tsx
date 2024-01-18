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

export interface MapContractsDictionary {
  [key: string]: Contract | null
}

export async function getStaticProps() {
  const adminDb = await initSupabaseAdmin()

  const mapContractsPromises = presidency2024.map((m) =>
    getContractFromSlug(m.slug, adminDb).then((contract) => {
      return { state: m.state, contract: contract }
    })
  )

  const mapContractsArray = await Promise.all(mapContractsPromises)

  // Convert array to dictionary
  const mapContractsDictionary: MapContractsDictionary =
    mapContractsArray.reduce((acc, mapContract) => {
      acc[mapContract.state] = mapContract.contract
      return acc
    }, {} as MapContractsDictionary)

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

  return {
    props: {
      mapContractsDictionary: mapContractsDictionary,
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
  mapContractsDictionary: MapContractsDictionary[]
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
    mapContractsDictionary,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
  } = props
  const [targetContract, setTargetContract] = useState<
    Contract | undefined | null
  >(mapContractsDictionary['GA'])

  const [hoveredContract, setHoveredContract] = useState<
    Contract | undefined | null
  >(undefined)

  if (
    !electionPartyContract ||
    !republicanCandidateContract ||
    !democratCandidateContract
  ) {
    return <Custom404 />
  }
  console.log(mapContractsDictionary)
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
          <USAMap
            // customize={stateContractMap}
            mapContractsDictionary={mapContractsDictionary}
            targetContract={targetContract}
            setTargetContract={setTargetContract}
            hoveredContract={hoveredContract}
            setHoveredContract={setHoveredContract}
          />
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
