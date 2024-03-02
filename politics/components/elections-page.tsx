'use client'
import { MultiContract } from 'common/contract'
import { ReferralSaver } from 'politics/components/referral-saver'
import { PoliticsCard } from 'politics/components/us-elections/contracts/politics-card'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Spacer } from 'web/components/layout/spacer'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useTracking } from 'web/hooks/use-tracking'
import Custom404 from 'web/pages/404'
import { ContractChart } from './charts/contract-chart'
import { HomepageMap } from './us-elections/usa-map/homepage-map'
import { ElectionsPageProps } from 'politics/public/data/elections-data'

export function USElectionsPage(props: ElectionsPageProps) {
  useSaveCampaign()
  useTracking('view elections')

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
    rawPresidencyStateContracts,
    rawSenateStateContracts,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
    republicanVPContract,
    democraticVPContract,
    partyChartParams,
  } = props

  return (
    <>
      <ReferralSaver />
      <Col className="gap-6 sm:gap-8 sm:px-4">
        <Col className="px-2 sm:px-0">
          <Row className="mt-2 items-center justify-between gap-4 font-serif text-2xl sm:mt-0 sm:justify-start sm:text-3xl">
            2024 Election Forecast
          </Row>
          <div className="text-canvas-500 text-md mt-2 inline-block font-normal">
            Live market odds for the US presidential election
          </div>
        </Col>

        <PoliticsCard
          contract={electionPartyContract as MultiContract}
          viewType="PARTY"
          customTitle="Which party will win the Presidential Election?"
          className="-mt-4"
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

        <HomepageMap
          rawPresidencyStateContracts={rawPresidencyStateContracts}
          rawSenateStateContracts={rawSenateStateContracts}
        />
      </Col>
      <Spacer h={4} />
    </>
  )
}
