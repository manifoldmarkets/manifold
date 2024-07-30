import { MultiContract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { PoliticsCard } from 'web/components/us-elections/contracts/politics-card'
import Custom404 from 'web/pages/404'
import { Row } from './layout/row'
import { HomepageMap } from './usa-map/homepage-map'
import { HorizontalDashboard } from './dashboard/horizontal-dashboard'
import Link from 'next/link'
import { ConditionalMarkets } from './us-elections/contracts/conditional-market/conditional-markets'
import { ElectionsPageProps } from 'web/public/data/elections-data'
import { Carousel } from './widgets/carousel'

export function USElectionsPage(props: ElectionsPageProps) {
  const {
    rawPresidencyStateContracts,
    rawSenateStateContracts,
    rawGovernorStateContracts,
    rawPolicyContracts,
    electionCandidateContract,
    electionPartyContract,
    republicanCandidateContract,
    democratCandidateContract,
    houseContract,
    democraticVPContract,
    democraticElectability,
    // republicanElectability,
    trendingDashboard,
    partyGraphData,
  } = props

  if (
    !electionPartyContract ||
    !electionCandidateContract ||
    !republicanCandidateContract ||
    !democratCandidateContract ||
    !houseContract ||
    !democraticElectability
    // !republicanElectability
  ) {
    return <Custom404 />
  }

  const { partyPoints, afterTime } = partyGraphData || {
    partyPoints: null,
    afterTime: 0,
  }

  const trending =
    trendingDashboard.state == 'not found' ? null : (
      <Col className="-mb-6">
        <Row className="items-center gap-1 font-semibold sm:text-lg">
          <div className="relative">
            <div className="h-4 w-4 animate-pulse rounded-full bg-indigo-500/40" />
            <div className="absolute left-1 top-1 h-2 w-2 rounded-full bg-indigo-500" />
          </div>
          <Link
            href="/election/politicsheadline"
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
    )

  return (
    <Col className="mb-8 gap-6 px-1 sm:gap-8 sm:px-2">
      <Col>
        <div className="text-primary-700 mt-4 text-2xl font-normal sm:mt-0 sm:text-3xl">
          Manifold 2024 Election Forecast
        </div>
        <div className="text-canvas-500 text-md mt-2 flex font-normal">
          Live prediction market odds on the US election
        </div>
      </Col>

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

      {trending}

      <HomepageMap
        rawPresidencyStateContracts={rawPresidencyStateContracts}
        rawSenateStateContracts={rawSenateStateContracts}
        rawGovernorStateContracts={rawGovernorStateContracts}
        houseContract={houseContract as MultiContract}
      />

      <Col className="gap-2">
        <Row className="items-center gap-2">
          <div className="bg-ink-600 flex h-[1px] grow flex-row" />
          <div className="text-ink-600  ">Presidential Nomination</div>
          <div className="bg-ink-600 flex h-[1px] grow flex-row" />
        </Row>
        <Row className="hidden gap-4 sm:inline-flex">
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
        <Carousel className=" gap-4 sm:hidden">
          <PoliticsCard
            contract={democratCandidateContract as MultiContract}
            maxAnswers={3}
            customTitle="Democratic"
            panelClassName="w-[18rem]"
            viewType="SMALL CANDIDATE"
          />
          <PoliticsCard
            contract={republicanCandidateContract as MultiContract}
            maxAnswers={3}
            customTitle="Republican"
            panelClassName="w-[18rem]"
            viewType="SMALL CANDIDATE"
          />
        </Carousel>
      </Col>

      <PoliticsCard
        customTitle="Democratic vice presidential nomination"
        contract={democraticVPContract as MultiContract}
        viewType="CANDIDATE"
      />

      <PoliticsCard
        contract={democraticElectability as MultiContract}
        viewType="CANDIDATE"
        customTitle={'Who would win if they were the Democratic nominee?'}
        excludeAnswers={['Joe Biden', '[Any Democrat Except Biden or Harris]']}
      />

      <Col className="hidden gap-6 sm:flex sm:gap-8">
        {/* <Col className="gap-2">
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
        </Col> */}
      </Col>

      {/* <PoliticsCard
          contract={republicanElectability as MultiContract}
          viewType="CANDIDATE"
          customTitle={'Who would win if they were the Republican nominee?'}
          excludeAnswers={['Donald Trump']}
        /> */}
      {/* <Col className="hidden gap-6 sm:flex sm:gap-8">
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
              customTitle="Democratic electability"
              className="w-1/2"
              viewType="SMALL CANDIDATE"
              excludeAnswers={['Joe Biden']}
            />
            <PoliticsCard
              contract={republicanElectability as MultiContract}
              maxAnswers={3}
              customTitle="Republican electability"
              className="w-1/2"
              viewType="SMALL CANDIDATE"
              excludeAnswers={['Donald Trump']}
            />
          </Row>
        </Col>
      </Col> */}

      <ConditionalMarkets rawPolicyContracts={rawPolicyContracts} />
    </Col>
  )
}
