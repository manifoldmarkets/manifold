import { ReactNode, useMemo, useState } from 'react'
import clsx from 'clsx'
import Link from 'next/link'

import { Contract, isMultiCpmm } from 'common/contract'
import { referralQuery } from 'common/util/share'
import { ENV_CONFIG } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'
import { Row } from './layout/row'
import { LiveElectionMap } from './usa-map/live-election-map'
import { TrendingMidtermsCarousel } from './us-elections/trending-midterms-carousel'
import { FeedContractCard } from './contract/feed-contract-card'
import { Presidency2028Section } from './us-elections/presidency-2028-section'
import { BackButton } from './contract/back-button'
import { Search } from './search'
import { FilterPill } from './search/filter-pills'
import { ElectionsPageProps } from 'web/public/data/elections-data'
import { SectionInView } from './us-elections/section-in-view'
import { PollingPerpsRow } from './us-elections/polling-perps-row'
import {
  ConditionalMarketsGrid,
  MarketSpotlightGrid,
} from './us-elections/market-spotlight'
import {
  ConditionalMatrix,
  LiveConditionOdds,
} from './us-elections/conditional-matrix'
import { electionOdds } from './usa-map/election-map-model'
import { getPartyProbs } from './usa-map/state-election-map'
import { track } from 'web/lib/service/analytics'
import { useUser } from 'web/hooks/use-user'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { buildShareUrl } from 'web/lib/util/share-url'
import {
  balanceOfPowerAnswerColor,
  MIDTERM_CONTEST_TOPIC_SLUG,
} from 'web/lib/politics/election-curation'
import type { MidtermSpotlightProps } from 'web/lib/politics/home'
import {
  ConditionalMatrixRow,
  HOUSE_2026_COLUMNS,
  PRESIDENT_2028_COLUMNS,
  withConditionProbs,
} from 'web/lib/politics/conditional-matrix'
import interactions from './us-elections/election-interactions.module.css'

// Kept for legacy political market panels that still reference it.
export const ELECTIONS_PARTY_QUESTION_PSEUDONYM =
  'Who will win the Presidential Election?'

// Topic tags for the bottom feed, so visitors can sort the election markets by
// race/subject from this page. Each slug is a real Manifold group with a healthy
// number of open markets (verified against prod). The first entry is the default
// view: the 2026 Midterms tag — tightly scoped to this page's focus, rather than
// the much broader "us-politics", which pulled in a lot of off-topic markets.
const ELECTION_FEED_TOPICS = [
  { slug: '2026-midterms', label: '2026 Midterms' },
  { slug: '2026-us-congressional-elections', label: '2026 Congress' },
  { slug: '2028-us-presidential-election-6tdsp26zly', label: '2028 President' },
  { slug: 'us-senate', label: 'Senate' },
  { slug: 'donald-trump', label: 'Trump' },
  { slug: 'us-politics', label: 'All politics' },
  { slug: 'elections', label: 'All elections' },
]

// One consistent, left-aligned section heading used throughout the page. An
// h2 under the page's h1, styled as before.
function SectionHeader(props: {
  children: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  // The action (e.g. "See all") sits under the subtitle on phones and at the
  // right from sm up, so it never squeezes the title.
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
      <Col className="gap-0.5">
        <h2 className="text-primary-700 text-xl font-semibold sm:text-2xl">
          {props.children}
        </h2>
        {props.subtitle && (
          <div className="text-ink-600 text-sm">{props.subtitle}</div>
        )}
      </Col>
      {props.action}
    </div>
  )
}

export function USElectionsPage(
  props: ElectionsPageProps &
    Partial<MidtermSpotlightProps> & { hideTitle?: boolean }
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
    additionalHouseContracts,
    ballotMeasureContracts,
    pollingPerpContracts,
    trendingContracts,
    contestContracts = [],
    conditionalRows = [],
    houseMatrixRows = [],
    presidencyMatrixRows = [],
    hideTitle,
  } = props

  const [feedTopic, setFeedTopic] = useState(ELECTION_FEED_TOPICS[0])

  const user = useUser()
  // Capture an incoming ?r= referral when a logged-out visitor lands here from
  // a shared link (the trending dashboard also does this, but do it at the page
  // level so it works even when trending is absent).
  useSaveReferral(user)

  // Share the page as it is being viewed: the current path and query, so an
  // explorer deep link (?office=senate&race=ME) survives, tagged with the
  // sharer's referral code so sign-ups from the link are credited. Read at
  // click time, because the explorer can update the URL without re-rendering
  // this component. shareUrl is the server-rendered fallback, as before.
  const referral = user?.username ? referralQuery(user.username) : undefined
  const shareUrl = buildShareUrl({
    domain: ENV_CONFIG.domain,
    pathname: '/election',
    search: '',
    referralQuery: referral,
  })
  const getShareUrl = () =>
    buildShareUrl({
      domain: ENV_CONFIG.domain,
      pathname: window.location.pathname,
      search: window.location.search,
      referralQuery: referral,
    })

  // Color the Balance of Power answers by what they mean (Democratic sweep
  // blue, Republican sweep red, the two splits purple) instead of the default
  // answer palette. Display only: the market itself is untouched.
  const balanceOfPowerColors = useMemo(
    () =>
      balanceOfPowerContract && isMultiCpmm(balanceOfPowerContract)
        ? Object.fromEntries(
            balanceOfPowerContract.answers.map((a) => [
              a.id,
              balanceOfPowerAnswerColor(a.text),
            ])
          )
        : undefined,
    [balanceOfPowerContract]
  )

  return (
    <Col
      className={clsx(interactions.scope, 'isolate mb-8 gap-6 px-1 sm:px-2')}
    >
      {/* Hero with back navigation, left-aligned (back sits left of the title).
          A visitor arriving from a shared link has no Manifold history to go
          back to, so the arrow goes Home instead of off-site. */}
      <Row className="items-center gap-2 pt-3 sm:pt-1">
        <BackButton homeFallback />
        <Col className={clsx(hideTitle && 'hidden')}>
          <h1 className="text-primary-700 text-3xl font-normal sm:text-4xl">
            Elections
          </h1>
          <div className="text-ink-600 text-sm sm:text-base">
            Live prediction market odds on US elections
          </div>
        </Col>
        <CopyLinkOrShareButton
          url={shareUrl}
          getUrl={getShareUrl}
          eventTrackingName="share elections page"
          tooltip="Share this page"
          color="gray-outline"
          size="sm"
          className="ml-auto shrink-0 gap-1.5 sm:ml-4"
        >
          Share
        </CopyLinkOrShareButton>
      </Row>

      {/* Chamber controls sit above the map's own surface. */}
      <SectionInView section="midterms map" className="gap-3">
        <SectionHeader>2026 Midterms</SectionHeader>
        <LiveElectionMap
          houseControlContract={houseControlContract}
          senateControlContract={senateControlContract}
          rawSenateStateContracts={rawSenateStateContracts}
          rawGovernorStateContracts={rawGovernorStateContracts}
          rawSenateCandidateContracts={rawSenateCandidateContracts}
          rawGovernorCandidateContracts={rawGovernorCandidateContracts}
          houseDistrictsContract={houseDistrictsContract}
          additionalHouseContracts={additionalHouseContracts}
          ballotMeasureContracts={ballotMeasureContracts}
        />
      </SectionInView>

      {/* Polling averages - the continuously-updating numbers (approval,
          generic ballot, favorability) that frame every midterm race. Perps,
          so they keep moving instead of settling like a binary market. */}
      {pollingPerpContracts.length > 0 && (
        <SectionInView section="polling" className="gap-3">
          <SectionHeader subtitle="VoteHub's live polling averages. Bet on whether they go higher or lower.">
            Polling averages
          </SectionHeader>
          <PollingPerpsRow contracts={pollingPerpContracts} />
        </SectionInView>
      )}

      {/* The Manifold Midterm Contest — community questions about the campaign
          itself that no other prediction site lists. Replaces the retired
          Redistricting watch-list, whose questions had all settled. Selected
          server-side by traders, then recent volume (rankContestMarkets). */}
      {contestContracts.length > 0 && (
        <SectionInView section="midterm contest" className="gap-3">
          <SectionHeader
            subtitle="Only on Manifold: the community's contest questions about the campaign trail, from candidate visits to winning margins."
            action={
              <Link
                href={`/topic/${MIDTERM_CONTEST_TOPIC_SLUG}`}
                className="text-primary-700 hover:text-primary-800 shrink-0 whitespace-nowrap text-sm font-medium hover:underline"
                onClick={() => track('click election contest see all')}
              >
                See all contest markets →
              </Link>
            }
          >
            Manifold Midterm Contest
          </SectionHeader>
          <MarketSpotlightGrid
            contracts={contestContracts}
            trackingPostfix="election midterm contest"
          />
        </SectionInView>
      )}

      {/* What the House result changes: the same questions asked under each
          outcome (web/lib/politics/conditional-matrix.ts). It takes the
          Balance of Power slot; until it has two complete rows (e.g. before
          its markets are created) the joint-distribution market shows here
          instead. */}
      {houseMatrixRows.length > 0 ? (
        <SectionInView section="conditional matrix 2026" className="gap-3">
          <SectionHeader subtitle="The same questions, asked under each outcome of the House race. Click a chance to bet on it.">
            What a Democratic House would change
          </SectionHeader>
          <HouseConditionalMatrix
            rows={houseMatrixRows}
            houseControlContract={houseControlContract}
          />
        </SectionInView>
      ) : (
        balanceOfPowerContract && (
          <SectionInView section="balance of power" className="gap-3">
            <SectionHeader>Balance of Power</SectionHeader>
            <FeedContractCard
              contract={balanceOfPowerContract}
              trackingPostfix="midterms balance of power"
              showGraph
              answerColors={balanceOfPowerColors}
            />
          </SectionInView>
        )
      )}

      {/* What follows the result: markets conditional on who wins. A curated
          list (web/lib/politics/midterm-conditionals.ts); pairs of "If
          Democrats win / If Republicans win" markets sit side by side. */}
      {conditionalRows.length > 0 && (
        <SectionInView section="conditional markets" className="gap-3">
          <SectionHeader subtitle="Bets on what happens next, depending on who wins. Each is refunded (resolves N/A) if its condition isn't met.">
            If Democrats win… or Republicans do
          </SectionHeader>
          <ConditionalMarketsGrid
            rows={conditionalRows}
            trackingPostfix="election conditional"
          />
        </SectionInView>
      )}

      {/* Trending — the hottest open midterm markets right now, auto-selected
          by daily score server-side and curated for launch
          (curateTrendingMarkets: federal and governor races, 10+ traders, at
          most two per creator, nothing shown elsewhere on the page). It sits
          below the midterms sections: the map and the control markets are
          what this page is uniquely for. */}
      {trendingContracts.length > 0 && (
        <SectionInView section="trending" className="gap-2">
          <Col className="gap-0.5">
            <h2 className="text-primary-700 flex w-fit items-center gap-1.5 text-xl font-semibold sm:text-2xl">
              <span className="relative h-4 w-4" aria-hidden>
                <span className="block h-4 w-4 animate-pulse rounded-full bg-indigo-500/40" />
                <span className="absolute left-1 top-1 block h-2 w-2 rounded-full bg-indigo-500" />
              </span>
              Trending
            </h2>
            <div className="text-ink-600 text-sm">
              The hottest midterm markets right now
            </div>
          </Col>
          <TrendingMidtermsCarousel contracts={trendingContracts} />
        </SectionInView>
      )}

      {/* 2028 outlook — one collapsible card (party split + candidate field).
          Sits below the midterms sections so the 2026 races (the page's focus)
          lead, with the longer-range 2028 outlook just above the general feed. */}
      {presidency2028Contract && (
        <SectionInView section="2028">
          <Presidency2028Section
            contract={presidency2028Contract}
            partyContract={presidency2028PartyContract}
          />
        </SectionInView>
      )}

      {/* The 2028 counterpart: questions asked under each party's president.
          Hidden until it has two complete rows. */}
      {presidencyMatrixRows.length > 0 && (
        <SectionInView section="conditional matrix 2028" className="gap-3">
          <SectionHeader subtitle="The same questions, asked under a Democratic and a Republican president. Click a chance to bet on it.">
            What the 2028 winner would change
          </SectionHeader>
          <PresidencyConditionalMatrix
            rows={presidencyMatrixRows}
            partyContract={presidency2028PartyContract}
          />
        </SectionInView>
      )}

      {/* Infinite-scroll feed of election markets; topic bubbles sit in their
          own row below the sort/filter controls (Search's extraFilterPills).
          Defaults to Total traders: "Best" surfaced one-trader seeded district
          markets first. The persist key changed with the default so returning
          visitors pick it up. */}
      <SectionInView section="feed" className="gap-3">
        <SectionHeader>More election markets</SectionHeader>
        <Search
          key={feedTopic.slug}
          persistPrefix="election-page-markets-v2"
          topicSlug={feedTopic.slug}
          contractsOnly
          hideSearchTypes
          useUrlParams={false}
          defaultSort="most-popular"
          defaultFilter="open"
          extraFilterPills={ELECTION_FEED_TOPICS.map((t) => (
            <FilterPill
              key={t.slug}
              selected={t.slug === feedTopic.slug}
              onSelect={() => {
                track('select election feed topic', { topic: t.slug })
                setFeedTopic(t)
              }}
            >
              {t.label}
            </FilterPill>
          ))}
        />
      </SectionInView>
    </Col>
  )
}

const MATRIX_FOOTNOTE =
  "Each market resolves N/A if its condition doesn't happen, so bets only count in that world."

// The 2026 House matrix. Column headers carry the live House control odds
// (the same market as the map's House card: YES is a Republican majority).
function HouseConditionalMatrix(props: {
  rows: ConditionalMatrixRow[]
  houseControlContract: Contract | null
}) {
  return (
    <LiveConditionOdds
      contract={props.houseControlContract}
      read={(c) => electionOdds(c, true)}
    >
      {(odds) => (
        <ConditionalMatrix
          caption="Chances by House result"
          columns={withConditionProbs(HOUSE_2026_COLUMNS, odds)}
          rows={props.rows}
          trackingName="election conditional matrix 2026"
          footnote={MATRIX_FOOTNOTE}
        />
      )}
    </LiveConditionOdds>
  )
}

// The 2028 matrix, headed by the live odds of the 2028 party market.
function PresidencyConditionalMatrix(props: {
  rows: ConditionalMatrixRow[]
  partyContract: Contract | null
}) {
  return (
    <LiveConditionOdds contract={props.partyContract} read={getPartyProbs}>
      {(odds) => (
        <ConditionalMatrix
          caption="Chances by 2028 presidential winner"
          columns={withConditionProbs(PRESIDENT_2028_COLUMNS, odds)}
          rows={props.rows}
          trackingName="election conditional matrix 2028"
          footnote={MATRIX_FOOTNOTE}
        />
      )}
    </LiveConditionOdds>
  )
}
