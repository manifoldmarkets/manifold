import clsx from 'clsx'
import { Contract, MultiContract } from 'common/contract'
import { LinkPreviews, fetchLinkPreviews } from 'common/link-preview'
import { getContractFromSlug } from 'common/supabase/contracts'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import { PoliticsArticle } from 'web/components/us-elections/article'
import { CandidateCard } from 'web/components/us-elections/contracts/candidate-card'
import { SmallCandidateCard } from 'web/components/us-elections/contracts/small-candidate-card'
import { StateContractCard } from 'web/components/us-elections/contracts/state-contract-card'
import { presidency2024 } from 'web/components/us-elections/usa-map/election-contract-data'
import { USAMap } from 'web/components/us-elections/usa-map/usa-map'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import Custom404 from './404'
import { PoliticsPartyCard } from 'web/components/us-elections/contracts/politics-party-card'
import { SEO } from 'web/components/SEO'

export type MapContractsDictionary = {
  [key: string]: Contract | null
}

export type ElectionsPageProps = {
  rawMapContractsDictionary: MapContractsDictionary
  electionPartyContract: Contract
  electionCandidateContract: Contract
  republicanCandidateContract: Contract
  democratCandidateContract: Contract
  newHampshireContract: Contract
  linkPreviews: LinkPreviews
  republicanVPContract: Contract
}

const NH_LINK =
  'https://www.cnn.com/2024/01/09/politics/cnn-new-hampshire-poll/index.html'

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

  const newHampshireContract = await getContractFromSlug(
    'who-will-win-the-new-hampshire-repu',
    adminDb
  )

  const republicanVPContract = await getContractFromSlug(
    'who-will-be-the-republican-nominee-8a36dedc6445',
    adminDb
  )

  const linkPreviews = await fetchLinkPreviews([NH_LINK])
  return {
    props: {
      rawMapContractsDictionary: mapContractsDictionary,
      electionPartyContract: electionPartyContract,
      electionCandidateContract: electionCandidateContract,
      republicanCandidateContract: republicanCandidateContract,
      democratCandidateContract: democratCandidateContract,
      newHampshireContract: newHampshireContract,
      linkPreviews: linkPreviews,
      republicanVPContract: republicanVPContract,
    },
    revalidate: 60,
  }
}

function useLiveContract(inputContract: Contract): Contract {
  const contract =
    useFirebasePublicContract(inputContract.visibility, inputContract.id) ??
    inputContract

  if (contract.mechanism === 'cpmm-multi-1') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const answers = useAnswersCpmm(contract.id)
    if (answers) {
      contract.answers = answers
    }
  }
  return contract
}

export type MapContracts = { state: string; contract: Contract | null }

export default function USElectionsPage(props: ElectionsPageProps) {
  useSaveCampaign()
  useTracking('view elections')
  const user = useUser()
  useSaveReferral(user)

  const {
    rawMapContractsDictionary,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
    newHampshireContract,
    linkPreviews,
    republicanVPContract,
  } = props

  if (
    !electionPartyContract ||
    !electionCandidateContract ||
    !republicanCandidateContract ||
    !democratCandidateContract ||
    !newHampshireContract ||
    !republicanVPContract
  ) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="us elections page 2024">
      <ElectionContent {...props} />
    </Page>
  )
}

function ElectionContent(props: ElectionsPageProps) {
  const {
    rawMapContractsDictionary,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
    newHampshireContract,
    linkPreviews,
    republicanVPContract,
  } = props

  const [targetState, setTargetState] = useState<string | undefined | null>(
    'GA'
  )

  const [hoveredState, setHoveredState] = useState<string | undefined | null>(
    undefined
  )

  const isMobile = useIsMobile()

  const mapContractsDictionary = Object.keys(rawMapContractsDictionary).reduce(
    (acc, key) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const contract = useLiveContract(rawMapContractsDictionary[key]!)
      acc[key] = contract
      return acc
    },
    {} as MapContractsDictionary
  )

  return (
    <>
      <SEO
        title="2024 Election Forecast"
        description="Live market odds for the US presidential election"
        // TODO: add a nice preview image
      />
      <Col className="gap-6 px-2 sm:gap-8 sm:px-4">
        <Col>
          <div className="text-primary-700 mt-4 inline-block text-2xl font-normal sm:mt-0 sm:text-3xl">
            2024 Election Forecast
          </div>
          <div className="text-canvas-500 text-md mt-2 inline-block font-normal">
            Live market odds for the US presidential election
          </div>
        </Col>

        <PoliticsPartyCard contract={electionPartyContract as MultiContract} />
        <CandidateCard contract={electionCandidateContract as MultiContract} />
        <CandidateCard contract={democratCandidateContract as MultiContract} />
        <CandidateCard
          contract={republicanCandidateContract as MultiContract}
        />
        <CandidateCard
          customTitle="2024 Republican vice presidential nomination"
          contract={republicanVPContract as MultiContract}
        />

        <Col className="bg-canvas-0 rounded-xl p-4">
          <div className="mx-auto font-semibold sm:text-xl">
            Which party will win the US Presidency?
          </div>
          <USAMap
            mapContractsDictionary={mapContractsDictionary}
            targetState={targetState}
            setTargetState={setTargetState}
            hoveredState={hoveredState}
            setHoveredState={setHoveredState}
          />
          {!!hoveredState || !!targetState ? (
            <StateContract
              targetContract={
                mapContractsDictionary[hoveredState! ?? targetState] as Contract
              }
              targetState={targetState}
              setTargetState={setTargetState}
            />
          ) : (
            <div className=" h-[183px] w-full" />
          )}
        </Col>
      </Col>
      <Spacer h={4} />
    </>
  )
}

function StateContract(props: {
  targetContract: Contract
  targetState?: string
  setTargetState: (state?: string) => void
}) {
  const { targetContract, targetState, setTargetState } = props
  return (
    <StateContractCard
      contract={targetContract}
      customTitle={extractStateFromSentence(targetContract.question)}
      titleSize="lg"
      targetState={targetState}
      setTargetState={setTargetState}
    />
  )
}

function extractStateFromSentence(sentence: string): string | undefined {
  const regex = /US Presidency in ([\w\s,.()]+)\?/
  const match = sentence.match(regex)

  return match ? match[1].trim() : undefined
}

function NHPrimaries(props: {
  linkPreviews: LinkPreviews
  newHampshireContract: Contract
  cardClassName?: string
}) {
  const { linkPreviews, newHampshireContract, cardClassName } = props
  return (
    <>
      <PoliticsArticle {...linkPreviews[NH_LINK]} className={cardClassName} />
      <SmallCandidateCard
        contract={newHampshireContract as MultiContract}
        className={clsx('bg-canvas-0 px-4 py-2 ', cardClassName)}
        maxAnswers={3}
      />
    </>
  )
}
