import { Col } from 'web/components/layout/col'
import { Row } from './layout/row'
import { HomepageMap } from './usa-map/homepage-map'
import { HorizontalDashboard } from './dashboard/horizontal-dashboard'
import Link from 'next/link'
import { FeedContractCard } from './contract/feed-contract-card'
import { BalanceOfPowerPanel } from './us-elections/balance-of-power-panel'
import { ElectionsPageProps } from 'web/public/data/elections-data'

// Kept for legacy political market panels that still reference it.
export const ELECTIONS_PARTY_QUESTION_PSEUDONYM =
  'Who will win the Presidential Election?'

export function USElectionsPage(
  props: ElectionsPageProps & { hideTitle?: boolean }
) {
  const {
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
          Manifold 2026 Midterm Forecast
        </div>
        <div className="text-canvas-500 text-md mt-2 flex font-normal">
          Live prediction market odds on the US midterm elections
        </div>
      </Col>

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
    </Col>
  )
}
