import { Col } from 'web/components/layout/col'
import { Row } from './layout/row'
import { HomepageMap } from './usa-map/homepage-map'
import { HorizontalDashboard } from './dashboard/horizontal-dashboard'
import Link from 'next/link'
import { FeedContractCard } from './contract/feed-contract-card'
import { BalanceOfPowerPanel } from './us-elections/balance-of-power-panel'
import { PoliticsCard } from './us-elections/contracts/politics-card'
import { Search } from './search'
import { ElectionsPageProps } from 'web/public/data/elections-data'

// Kept for legacy political market panels that still reference it.
export const ELECTIONS_PARTY_QUESTION_PSEUDONYM =
  'Who will win the Presidential Election?'

export function USElectionsPage(
  props: ElectionsPageProps & { hideTitle?: boolean }
) {
  const {
    presidency2028Contract,
    rawSenateStateContracts,
    rawGovernorStateContracts,
    rawSenateCandidateContracts,
    rawGovernorCandidateContracts,
    balanceOfPowerContract,
    houseControlContract,
    senateControlContract,
    houseDistrictsContract,
    trendingDashboard,
    hideTitle,
  } = props

  const trending =
    trendingDashboard.state == 'not found' ? null : (
      <Col>
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
      <Col className={hideTitle ? 'hidden' : ''}>
        <div className="text-primary-700 mt-4 text-2xl font-normal sm:mt-0 sm:text-3xl">
          Elections
        </div>
        <div className="text-canvas-500 text-md mt-2 flex font-normal">
          Live prediction market odds on US elections
        </div>
      </Col>

      {/* 2028 presidential field — candidate faces with win odds. */}
      {presidency2028Contract && (
        <PoliticsCard
          contract={presidency2028Contract}
          viewType="CANDIDATE"
          customTitle="Who will be president in 2028?"
          titleSize="lg"
          excludeAnswers={['No 2028 Election']}
        />
      )}

      <div className="text-primary-700 mt-2 text-2xl font-normal sm:text-3xl">
        2026 Midterms
      </div>

      {/* Big balance-of-power hero: the three levers of federal power. */}
      <BalanceOfPowerPanel
        houseControl={houseControlContract}
        senateControl={senateControlContract}
      />

      <HomepageMap
        rawSenateStateContracts={rawSenateStateContracts}
        rawGovernorStateContracts={rawGovernorStateContracts}
        rawSenateCandidateContracts={rawSenateCandidateContracts}
        rawGovernorCandidateContracts={rawGovernorCandidateContracts}
        houseDistrictsContract={houseDistrictsContract}
      />

      {trending}

      {/* The full joint-distribution market, for trading the exact split. */}
      {balanceOfPowerContract && (
        <FeedContractCard
          contract={balanceOfPowerContract}
          trackingPostfix="midterms balance of power"
          showGraph
        />
      )}

      {/* Infinite-scroll feed of all US-politics markets. */}
      <Col className="gap-2">
        <div className="text-primary-700 text-xl font-normal sm:text-2xl">
          More election markets
        </div>
        <Search
          persistPrefix="election-page-markets"
          topicSlug="us-politics"
          contractsOnly
          hideSearchTypes
          useUrlParams={false}
          defaultSort="score"
          defaultFilter="open"
        />
      </Col>
    </Col>
  )
}
