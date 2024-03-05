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
import { HorizontalDashboard } from './dashboard/horizontal-dashboard'
import Link from 'next/link'

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
    republicanElectability,
    democraticElectability,
  } = props

  if (
    !electionPartyContract ||
    !electionCandidateContract ||
    !republicanCandidateContract ||
    !democratCandidateContract ||
    !newHampshireContract ||
    !democraticElectability ||
    !republicanElectability
  ) {
    return <Custom404 />
  }

  return <ElectionContent {...props} />
}

function ElectionContent(props: ElectionsPageProps) {
  const {
    rawPresidencyStateContracts,
    rawSenateStateContracts,
    rawGovernorStateContracts,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
    republicanVPContract,
    democraticVPContract,
    democraticElectability,
    republicanElectability,
    trendingDashboard,
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
        {trendingDashboard.state == 'not found' ? null : (
          <Col>
            <Row className="mb-2 items-center gap-1 font-semibold sm:text-lg">
              <div className="relative">
                <div className="h-4 w-4 animate-pulse rounded-full bg-indigo-500/40" />
                <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-indigo-500" />
              </div>
              <Link
                href="/politics/politicsheadline"
                className="hover:text-primary-700 hover:underline"
              >
                Trending
              </Link>
            </Row>
            <HorizontalDashboard
              initialDashboard={trendingDashboard.initialDashboard}
              previews={trendingDashboard.previews}
              initialContracts={trendingDashboard.initialContracts}
              slug={trendingDashboard.slug}
            />
          </Col>
        )}
        <PoliticsCard
          contract={electionCandidateContract as MultiContract}
          viewType="CANDIDATE"
          className="-mt-4"
        />
        <PoliticsCard
          contract={electionPartyContract as MultiContract}
          viewType="PARTY"
          customTitle="Which party will win the Presidential Election?"
        />
        <Col className="gap-6 sm:hidden sm:gap-8">
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
        <Col className="hidden gap-6 sm:flex sm:gap-8">
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
          rawGovernorStateContracts={rawGovernorStateContracts}
        />
        <Col className="gap-6 sm:hidden sm:gap-8">
          <PoliticsCard
            contract={democraticElectability as MultiContract}
            viewType="CANDIDATE"
            customTitle={'Who would win if they were the Democratic nominee?'}
            excludeAnswers={['Joe Biden']}
          />
          <PoliticsCard
            contract={republicanElectability as MultiContract}
            viewType="CANDIDATE"
            customTitle={'Who would win if they were the Republican nominee?'}
            excludeAnswers={['Donald Trump']}
          />
        </Col>
        <Col className="hidden gap-6 sm:flex sm:gap-8">
          <Col className="gap-2">
            <Row className="items-center gap-2">
              <div className="bg-ink-600 flex h-[1px] grow flex-row" />
              <div className="text-ink-600  ">
                Who would win the presidency if they were the nominee?
              </div>
              <div className="bg-ink-600 flex h-[1px] grow flex-row" />
            </Row>
            <Row className="gap-4">
              <PoliticsCard
                contract={democraticElectability as MultiContract}
                maxAnswers={3}
                customTitle="Democratic"
                className="w-1/2"
                viewType="SMALL CANDIDATE"
                excludeAnswers={['Joe Biden']}
              />
              <PoliticsCard
                contract={republicanElectability as MultiContract}
                maxAnswers={3}
                customTitle="Republican"
                className="w-1/2"
                viewType="SMALL CANDIDATE"
                excludeAnswers={['Donald Trump']}
              />
            </Row>
          </Col>
        </Col>
      </Col>
      <Spacer h={4} />
    </>
  )
}
