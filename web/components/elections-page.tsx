import { ReactNode } from 'react'
import clsx from 'clsx'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Row } from './layout/row'
import { HomepageMap } from './usa-map/homepage-map'
import { HorizontalDashboard } from './dashboard/horizontal-dashboard'
import { FeedContractCard } from './contract/feed-contract-card'
import { BalanceOfPowerPanel } from './us-elections/balance-of-power-panel'
import { Presidency2028Section } from './us-elections/presidency-2028-section'
import { BackButton } from './contract/back-button'
import { ContractsTable } from './contract/contracts-table'
import { Search } from './search'
import { ElectionsPageProps } from 'web/public/data/elections-data'

// Kept for legacy political market panels that still reference it.
export const ELECTIONS_PARTY_QUESTION_PSEUDONYM =
  'Who will win the Presidential Election?'

// One consistent, centered section divider used throughout the page so the
// blue headings read as a deliberate rhythm rather than scattered labels.
function SectionHeader(props: { children: ReactNode; subtitle?: string }) {
  return (
    <Col className="items-center gap-0.5 text-center">
      <div className="text-primary-700 text-xl font-semibold sm:text-2xl">
        {props.children}
      </div>
      {props.subtitle && (
        <div className="text-ink-500 text-sm">{props.subtitle}</div>
      )}
    </Col>
  )
}

export function USElectionsPage(
  props: ElectionsPageProps & { hideTitle?: boolean }
) {
  const {
    presidency2028Contract,
    presidency2028PartyContract,
    rawSenateStateContracts,
    rawGovernorStateContracts,
    rawSenateCandidateContracts,
    rawGovernorCandidateContracts,
    balanceOfPowerContract,
    houseControlContract,
    senateControlContract,
    houseDistrictsContract,
    primaryContracts,
    trendingDashboard,
    hideTitle,
  } = props

  const trending =
    trendingDashboard.state == 'not found' ? null : (
      <Col className="gap-2">
        <Link
          href="/election/politicsheadline"
          className="text-primary-700 hover:text-primary-800 mx-auto flex items-center gap-1.5 text-xl font-semibold sm:text-2xl"
        >
          <span className="relative h-4 w-4">
            <span className="block h-4 w-4 animate-pulse rounded-full bg-indigo-500/40" />
            <span className="absolute left-1 top-1 block h-2 w-2 rounded-full bg-indigo-500" />
          </span>
          Trending
        </Link>
        <HorizontalDashboard
          initialDashboard={trendingDashboard.initialDashboard}
          previews={trendingDashboard.previews}
          initialContracts={trendingDashboard.initialContracts}
          slug={trendingDashboard.slug}
        />
      </Col>
    )

  return (
    <Col className="mb-8 gap-6 px-1 sm:px-2">
      {/* Hero with back navigation (back is left, title stays centered). */}
      <Row className="relative items-center justify-center pt-3 sm:pt-1">
        <BackButton className="absolute left-0 top-1/2 -translate-y-1/2" />
        <Col className={clsx('items-center text-center', hideTitle && 'hidden')}>
          <div className="text-primary-700 text-3xl font-normal sm:text-4xl">
            Elections
          </div>
          <div className="text-ink-500 text-sm sm:text-base">
            Live prediction market odds on US elections
          </div>
        </Col>
      </Row>

      {/* 2028 outlook — one collapsible card (party split + candidate field). */}
      {presidency2028Contract && (
        <Presidency2028Section
          contract={presidency2028Contract}
          partyContract={presidency2028PartyContract}
        />
      )}

      {/* 2026 Midterms — the balance-of-power levers and the race map together
          in a single card so the section reads as one unit. */}
      <Col className="gap-3">
        <SectionHeader subtitle="Who controls Washington after the 2026 midterms">
          2026 Midterms
        </SectionHeader>
        <Col className="bg-canvas-0 gap-4 rounded-xl p-4 sm:p-5">
          <BalanceOfPowerPanel
            houseControl={houseControlContract}
            senateControl={senateControlContract}
          />
          <div className="border-ink-200 border-t" />
          <HomepageMap
            rawSenateStateContracts={rawSenateStateContracts}
            rawGovernorStateContracts={rawGovernorStateContracts}
            rawSenateCandidateContracts={rawSenateCandidateContracts}
            rawGovernorCandidateContracts={rawGovernorCandidateContracts}
            houseDistrictsContract={houseDistrictsContract}
          />
        </Col>
      </Col>

      {/* Notable 2026 primaries — a compact, scannable watch-list. */}
      {primaryContracts.length > 0 && (
        <Col className="gap-3">
          <SectionHeader>2026 Primaries to watch</SectionHeader>
          <ContractsTable contracts={primaryContracts} hideAvatar />
        </Col>
      )}

      {trending}

      {/* The full joint-distribution market, for trading the exact split. */}
      {balanceOfPowerContract && (
        <Col className="gap-3">
          <SectionHeader>Balance of Power</SectionHeader>
          <FeedContractCard
            contract={balanceOfPowerContract}
            trackingPostfix="midterms balance of power"
            showGraph
          />
        </Col>
      )}

      {/* Infinite-scroll feed of all US-politics markets. */}
      <Col className="gap-3">
        <SectionHeader>More election markets</SectionHeader>
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
