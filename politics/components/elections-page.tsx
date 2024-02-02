'use client'
import { Contract, MultiContract } from 'common/contract'
import {
  ElectionsPageProps,
  MapContractsDictionary,
} from 'common/politics/elections-data'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { PoliticsCard } from 'politics/components/us-elections/contracts/politics-card'
import { StateContractCard } from 'politics/components/us-elections/contracts/state-contract-card'
import { USAMap } from 'politics/components/us-elections/usa-map/usa-map'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useTracking } from 'web/hooks/use-tracking'
import { useUser } from 'web/hooks/use-user'
import Custom404 from 'web/pages/404'
import { Row } from 'web/components/layout/row'
import { ENV_CONFIG } from 'common/envs/constants'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { ChoiceChart, ContractChart } from './charts/contract-chart'
import { ChoiceContractChart } from 'web/components/charts/contract/choice'

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
    partyChartParams,
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
      <Col className="gap-6 sm:gap-8 sm:px-4">
        <Col className="px-2 sm:px-0">
          <Row className="mt-2 items-center justify-between gap-4 font-serif text-2xl sm:mt-0 sm:justify-start sm:text-3xl">
            2024 Election Forecast
            <CopyLinkOrShareButton
              url={`https://${ENV_CONFIG.domain}/`}
              eventTrackingName="copy dashboard link"
              tooltip="Share"
            />
          </Row>
          <div className="text-canvas-500 text-md mt-2 inline-block font-normal">
            Live market odds for the US presidential election
          </div>
        </Col>

        <PoliticsCard
          contract={electionPartyContract as MultiContract}
          viewType="PARTY"
          customTitle="Which party will win the Presidential Election?"
        >
          {partyChartParams && (
            <ContractChart
              contract={(electionPartyContract as MultiContract)!}
              historyData={partyChartParams.historyData}
              chartAnnotations={partyChartParams.chartAnnotations}
              shownAnswers={(electionPartyContract as MultiContract)!.answers
                .filter((a) => a.text != 'Other')
                .map((a) => a.id)}
            />
          )}
        </PoliticsCard>

        <PoliticsCard
          contract={electionCandidateContract as MultiContract}
          viewType="CANDIDATE"
        />
        <Col className="gap-6 sm:gap-8 lg:hidden">
          <PoliticsCard
            contract={democratCandidateContract as MultiContract}
            viewType="CANDIDATE"
          />
          <PoliticsCard
            customTitle="Democratic vice presidential nomination"
            contract={democraticVPContract as MultiContract}
            viewType="CANDIDATE"
          />
          <PoliticsCard
            contract={republicanCandidateContract as MultiContract}
            viewType="CANDIDATE"
          />
          <PoliticsCard
            customTitle="Republican vice presidential nomination"
            contract={republicanVPContract as MultiContract}
            viewType="CANDIDATE"
          />
        </Col>
        <Col className="hidden gap-6 sm:gap-8 lg:flex">
          <Col className="gap-2">
            <Row className="items-center gap-2">
              <div className="bg-ink-600 flex h-[1px] grow flex-row" />
              <div className="text-ink-600  ">Presidential Nomination</div>
              <div className="bg-ink-600 flex h-[1px] grow flex-row" />
            </Row>
            <Row className="gap-4">
              <PoliticsCard
                contract={democratCandidateContract as MultiContract}
                maxAnswers={3}
                customTitle="Democratic"
                className="w-1/2"
                viewType="SMALL CANDIDATE"
              />
              <PoliticsCard
                contract={republicanCandidateContract as MultiContract}
                maxAnswers={3}
                customTitle="Republican"
                className="w-1/2"
                viewType="SMALL CANDIDATE"
              />
            </Row>
          </Col>
          <Col className="gap-2">
            <Row className="items-center gap-2">
              <div className="bg-ink-600 flex h-[1px] grow flex-row" />
              <div className="text-ink-600">Vice Presidential Nomination</div>
              <div className="bg-ink-600 flex h-[1px] grow flex-row" />
            </Row>
            <Row className="gap-4">
              <PoliticsCard
                contract={democraticVPContract as MultiContract}
                maxAnswers={3}
                customTitle="Democratic"
                className="w-1/2"
                viewType="SMALL CANDIDATE"
              />
              <PoliticsCard
                contract={republicanVPContract as MultiContract}
                maxAnswers={3}
                customTitle="Republican"
                className="w-1/2"
                viewType="SMALL CANDIDATE"
              />
            </Row>
          </Col>
        </Col>

        <Col className="bg-canvas-0 p-4">
          <div className="mx-auto font-serif font-semibold sm:text-xl">
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
