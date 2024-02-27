'use client'
import { MultiContract } from 'common/contract'
import { ElectionsPageProps } from 'common/politics/elections-data'
import { Col } from 'web/components/layout/col'
import { Spacer } from 'web/components/layout/spacer'
import { PoliticsCard } from 'web/components/us-elections/contracts/politics-card'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import Custom404 from 'web/pages/404'
import { Row } from './layout/row'
import { HomepageMap } from './usa-map/homepage-map'
import { useSaveContractVisitsLocally } from 'web/hooks/use-save-visits'

export function USElectionsPage(props: ElectionsPageProps) {
  const user = useUser()
  useSaveReferral(user)
  // mark US prez contract as seen to ensure US Politics group is auto-selected during onboarding
  useSaveContractVisitsLocally(user === null, 'ikSUiiNS8MwAI75RwEJf')
  useSaveCampaign()

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
  } = props

  return (
    <>
      <Col className="gap-6 px-2 sm:gap-8 sm:px-4">
        <Col>
          <div className="text-primary-700 mt-4 text-2xl font-normal sm:mt-0 sm:text-3xl">
            Manifold 2024 Election Forecast
          </div>
          <div className="text-canvas-500 text-md mt-2 flex font-normal">
            Live prediction market odds on the US election
          </div>
        </Col>

        <PoliticsCard
          contract={electionPartyContract as MultiContract}
          viewType="PARTY"
          customTitle="Which party will win the Presidential Election?"
          className="-mt-4"
        />
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
