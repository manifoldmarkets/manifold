import { ReactNode, useState } from 'react'
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
import { FilterPill } from './search/filter-pills'
import { ElectionsPageProps } from 'web/public/data/elections-data'

// Kept for legacy political market panels that still reference it.
export const ELECTIONS_PARTY_QUESTION_PSEUDONYM =
  'Who will win the Presidential Election?'

// Topic tags for the bottom feed, so visitors can sort the election markets by
// race/subject from this page. Each slug is a real Manifold group with a healthy
// number of open markets (verified against prod).
const ELECTION_FEED_TOPICS = [
  { slug: 'us-politics', label: 'All politics' },
  { slug: '2026-us-congressional-elections', label: '2026 Congress' },
  { slug: '2028-us-presidential-election-6tdsp26zly', label: '2028 President' },
  { slug: 'us-senate', label: 'Senate' },
  { slug: 'donald-trump', label: 'Trump' },
  { slug: 'elections', label: 'All elections' },
]

// One consistent, left-aligned section divider used throughout the page.
function SectionHeader(props: { children: ReactNode; subtitle?: string }) {
  return (
    <Col className="gap-0.5">
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

  const [feedTopic, setFeedTopic] = useState(ELECTION_FEED_TOPICS[0])

  const trending =
    trendingDashboard.state == 'not found' ? null : (
      <Col className="gap-2">
        <Link
          href="/election/politicsheadline"
          className="text-primary-700 hover:text-primary-800 flex w-fit items-center gap-1.5 text-xl font-semibold sm:text-2xl"
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
      {/* Hero with back navigation, left-aligned (back sits left of the title). */}
      <Row className="items-center gap-2 pt-3 sm:pt-1">
        <BackButton />
        <Col className={clsx(hideTitle && 'hidden')}>
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

      {trending}

      {/* Infinite-scroll feed of election markets; topic bubbles sit in their
          own row below the sort/filter controls (Search's extraFilterPills). */}
      <Col className="gap-3">
        <SectionHeader>More election markets</SectionHeader>
        <Search
          key={feedTopic.slug}
          persistPrefix="election-page-markets"
          topicSlug={feedTopic.slug}
          contractsOnly
          hideSearchTypes
          useUrlParams={false}
          defaultSort="score"
          defaultFilter="open"
          extraFilterPills={ELECTION_FEED_TOPICS.map((t) => (
            <FilterPill
              key={t.slug}
              selected={t.slug === feedTopic.slug}
              onSelect={() => setFeedTopic(t)}
            >
              {t.label}
            </FilterPill>
          ))}
        />
      </Col>
    </Col>
  )
}
