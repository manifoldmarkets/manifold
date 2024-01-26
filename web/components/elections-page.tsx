'use client'
import { Contract, MultiContract } from 'common/contract'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import Custom404 from 'web/pages/404'
import { useState } from 'react'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { PoliticsPartyCard } from 'web/components/us-elections/contracts/politics-party-card'
import { CandidateCard } from 'web/components/us-elections/contracts/candidate-card'
import { USAMap } from 'web/components/us-elections/usa-map/usa-map'
import { Spacer } from 'web/components/layout/spacer'
import { StateContractCard } from 'web/components/us-elections/contracts/state-contract-card'
import {
  ElectionsPageProps,
  MapContractsDictionary,
} from 'common/election-contract-data'

export function USElectionsPage(props: ElectionsPageProps) {
  useSaveCampaign()
  useTracking('view elections')
  const user = useUser()
  useSaveReferral(user)

  const {
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
    newHampshireContract,
  } = props

  if (
    !electionPartyContract ||
    !electionCandidateContract ||
    !republicanCandidateContract ||
    !democratCandidateContract ||
    !newHampshireContract
  ) {
    return <Custom404 />
  }

  return <ElectionContent {...props} />
}

function ElectionContent(props: ElectionsPageProps) {
  const {
    rawMapContractsDictionary,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
    republicanVPContract,
    democraticVPContract,
  } = props

  const [targetState, setTargetState] = useState<string | undefined | null>(
    'GA'
  )

  const [hoveredState, setHoveredState] = useState<string | undefined | null>(
    undefined
  )

  const mapContractsDictionary = Object.keys(rawMapContractsDictionary).reduce(
    (acc, key) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      acc[key] = useLiveContract(rawMapContractsDictionary[key]!)
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
          customTitle="Democratic vice presidential nomination"
          contract={democraticVPContract as MultiContract}
        />
        <CandidateCard
          contract={republicanCandidateContract as MultiContract}
        />
        <CandidateCard
          customTitle="Republican vice presidential nomination"
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
  targetState?: string | null
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
