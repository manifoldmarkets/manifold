import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Fragment, ReactNode, useEffect, useState } from 'react'

import { ENV_CONFIG } from 'common/envs/constants'
import { referralQuery } from 'common/util/share'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { BackButton } from 'web/components/contract/back-button'
import { Search } from 'web/components/search'
import { FilterPill } from 'web/components/search/filter-pills'
// Follow or block a topic; the sports hubs' menu, which fits any topic.
import { SportTopicMenu } from 'web/components/sports/sport-topic-menu'
import {
  ConditionalMatrix,
  LiveConditionOdds,
} from 'web/components/us-elections/conditional-matrix'
import interactions from 'web/components/us-elections/election-interactions.module.css'
import { MarketSpotlightGrid } from 'web/components/us-elections/market-spotlight'
import { PollingPerpsRow } from 'web/components/us-elections/polling-perps-row'
import { SectionInView } from 'web/components/us-elections/section-in-view'
import { getPartyProbs } from 'web/components/usa-map/state-election-map'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import {
  ConditionalMatrixRow,
  PRESIDENT_2028_COLUMNS,
  withConditionProbs,
} from 'web/lib/politics/conditional-matrix'
import type { Elections2028PageProps } from 'web/lib/politics/elections-2028'
import {
  BOARD_FREEZE,
  ELECTION_HUB_TOPICS,
  PRESIDENTIAL_2028_TOPIC_SLUG,
} from 'web/lib/politics/elections-2028-config'
import { SectionKey, sectionOrder } from 'web/lib/politics/election-phase'
import { track } from 'web/lib/service/analytics'
import { buildShareUrl } from 'web/lib/util/share-url'
import { AccuracyBanner } from './accuracy-banner'
import { BalanceOfPower } from './balance-of-power'
import { CandidateBars } from './candidate-bars'
import { ElectionLeaderboards } from './election-leaderboards'
import { ElectionMap } from './election-map'
import { MoversStrip } from './movers-strip'
import { PartyOddsBar } from './party-odds-bar'
import { PrimariesBoard } from './primaries-board'
import { RaceBoard } from './race-board'
import { RaceCard, RangePicker, useRange } from './race-section'
import { RoadAhead } from './road-ahead'
import { RoadTo270 } from './road-to-270'
import { Swings2026 } from './swings-2026'

// /election from the 2026 midterms to the 2030 ones: the 2028 race, every
// election on the way, and the cycles after. The section order follows the
// calendar (election-phase.ts), so the page needs no edits as it moves from
// the nomination race to primaries, conventions, the general, results and
// the 2030 midterms. Sections render only when their markets loaded, so a
// missing market drops a card, never the page.

const FEED_TOPICS = [
  { slug: PRESIDENTIAL_2028_TOPIC_SLUG, label: '2028 President' },
  { slug: 'elections', label: 'All elections' },
  { slug: 'us-politics', label: 'US politics' },
  { slug: 'us-senate', label: 'Senate' },
  { slug: 'donald-trump', label: 'Trump' },
]
type FeedTopic = (typeof FEED_TOPICS)[number]

// The feed's topic from ?topic= (a hub topic's page sends visitors here
// with it), else its default.
function feedTopicFor(slug: unknown): FeedTopic | undefined {
  if (typeof slug !== 'string') return undefined
  return (
    FEED_TOPICS.find((t) => t.slug === slug) ??
    ELECTION_HUB_TOPICS.find((t) => t.slug === slug)
  )
}

function SectionHeader(props: {
  children: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  id?: string
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
      <div className="flex flex-col gap-0.5">
        <h2
          id={props.id}
          className="text-ink-1000 text-xl font-semibold sm:text-2xl"
        >
          {props.children}
        </h2>
        {props.subtitle && (
          <div className="text-ink-600 text-sm">{props.subtitle}</div>
        )}
      </div>
      {props.action}
    </div>
  )
}

export function Elections2028Page(props: Elections2028PageProps) {
  const {
    now,
    phase,
    hubTopic,
    leaderboards,
    leaderboardDefault,
    partyContract,
    popularVoteContract,
    balanceOfPowerContract,
    congressContract,
    charts,
    movers,
    demVpContract,
    gopVpContract,
    ticketContract,
    model,
    accuracy,
    swings,
    board2028,
    board2028Mode,
    board2030,
    board2030Mode,
    balanceOfPower2030,
    primaries,
    primaryContracts,
    more2028,
    offYear,
    before2028World,
    later,
    presidencyMatrixRows,
    unprecedentedContracts,
    pollingPerpContracts,
    trendingContracts,
  } = props
  const [range, setRange] = useRange()
  const router = useRouter()
  const [feedTopic, setFeedTopic] = useState<FeedTopic>(FEED_TOPICS[0])
  useEffect(() => {
    if (!router.isReady) return
    setFeedTopic(feedTopicFor(router.query.topic) ?? FEED_TOPICS[0])
  }, [router.isReady, router.query.topic])
  // A topic from ?topic= that isn't one of the usual pills gets its own.
  const feedTopics = FEED_TOPICS.some((t) => t.slug === feedTopic.slug)
    ? FEED_TOPICS
    : [feedTopic, ...FEED_TOPICS]
  const user = useUser()
  useSaveReferral(user)

  const referral = user?.username ? referralQuery(user.username) : undefined
  const shareUrl = buildShareUrl({
    domain: ENV_CONFIG.domain,
    pathname: '/election',
    search: '',
    referralQuery: referral,
  })

  const president = charts.find((c) => c.key === 'president')
  const nominees = charts.filter((c) => c.key !== 'president')
  const results = phase === 'results' || phase === 'midterms2030'

  // Every section, once; the phase decides which show and in what order
  // (election-phase.ts). A section whose markets didn't load renders nothing.
  const sections: Record<SectionKey, ReactNode> = {
    accuracy: <AccuracyBanner story={accuracy} />,

    leaderboards: leaderboards.length > 0 && (
      <ElectionLeaderboards
        boards={leaderboards}
        defaultKey={leaderboardDefault}
      />
    ),

    map: (board2028.length > 0 || primaries.length > 0) && (
      <SectionInView section="2028 map" className="flex flex-col gap-3">
        <SectionHeader
          id="map"
          subtitle="Every state's races and primaries. Pick a race, then a state for all its markets."
        >
          The map
        </SectionHeader>
        <ElectionMap
          races={board2028}
          primaries={primaries}
          offYear={offYear}
          defaultMode={phase === 'primaries' ? 'primary' : 'president'}
        />
      </SectionInView>
    ),

    roadAhead: <RoadAhead now={now} primaries={primaries} />,

    race: (
      <SectionInView section="2028 race" className="flex flex-col gap-4">
        <SectionHeader
          id="race"
          subtitle={
            results
              ? 'Who won the White House, and the odds that got them there.'
              : 'Who wins the White House, and who gets nominated.'
          }
          action={<RangePicker value={range} onChange={setRange} />}
        >
          {results ? 'The 2028 presidential race' : 'The race for 2028'}
        </SectionHeader>
        {partyContract && (
          <div className="bg-canvas-0 border-ink-200 rounded-xl border p-4">
            <PartyOddsBar
              contract={partyContract}
              label="Which party wins the presidency"
              trackingName="election 2028 party bar"
            />
          </div>
        )}
        {president && (
          <RaceCard chart={president} now={now} range={range} variant="hero" />
        )}
        {nominees.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {nominees.map((chart) => (
              <RaceCard
                key={chart.key}
                chart={chart}
                now={now}
                range={range}
                variant="compact"
              />
            ))}
          </div>
        )}
        {(popularVoteContract ||
          balanceOfPowerContract ||
          congressContract) && (
          <div className="grid gap-4 md:grid-cols-2">
            {balanceOfPowerContract && (
              <BalanceOfPower
                contract={balanceOfPowerContract}
                title="Who controls Washington after 2028"
              />
            )}
            <div className="flex flex-col gap-4">
              {popularVoteContract && (
                <div className="bg-canvas-0 border-ink-200 rounded-xl border p-4">
                  <PartyOddsBar
                    contract={popularVoteContract}
                    label="Who wins the popular vote"
                    trackingName="election 2028 popular vote"
                    size="sm"
                  />
                </div>
              )}
              {congressContract && (
                <div className="bg-canvas-0 border-ink-200 rounded-xl border p-4">
                  <PartyOddsBar
                    contract={congressContract}
                    label="Who controls Congress after 2028"
                    trackingName="election 2028 congress"
                    size="sm"
                  />
                </div>
              )}
            </div>
          </div>
        )}
        {more2028.length > 0 && (
          <>
            <h3 className="text-ink-900 mt-1 text-base font-semibold">
              More on 2028
            </h3>
            <MarketSpotlightGrid
              contracts={more2028}
              trackingPostfix="election 2028 more"
            />
          </>
        )}
      </SectionInView>
    ),

    movers: movers.length > 0 && (
      <SectionInView section="2028 movers" className="flex flex-col gap-3">
        <SectionHeader subtitle="The biggest moves in the 2028 races over the last seven days.">
          Biggest movers this week
        </SectionHeader>
        <MoversStrip movers={movers} charts={charts} />
      </SectionInView>
    ),

    runningMates: (demVpContract || gopVpContract || ticketContract) && (
      <SectionInView
        section="2028 running mates"
        className="flex flex-col gap-3"
      >
        <SectionHeader subtitle="Each party's pick for vice president, and who ends up on the winning ticket.">
          Running mates
        </SectionHeader>
        <div className="grid gap-4 md:grid-cols-3">
          {demVpContract && (
            <CandidateBars
              contract={demVpContract}
              title="Democratic VP nominee"
              party="D"
              trackingName="election 2028 dem vp"
            />
          )}
          {gopVpContract && (
            <CandidateBars
              contract={gopVpContract}
              title="Republican VP nominee"
              party="R"
              trackingName="election 2028 gop vp"
            />
          )}
          {ticketContract && (
            <CandidateBars
              contract={ticketContract}
              title="On the winning ticket"
              subtitle="President or vice president. Each name is its own market."
              rows={6}
              trackingName="election 2028 ticket"
            />
          )}
        </div>
      </SectionInView>
    ),

    roadTo270: model && (
      <SectionInView section="road to 270" className="flex flex-col gap-3">
        <SectionHeader subtitle="Our electoral college model, built from Manifold's state-by-state markets.">
          The road to 270
        </SectionHeader>
        <RoadTo270 model={model} partyContract={partyContract} />
      </SectionInView>
    ),

    board: board2028.length > 0 && (
      <SectionInView section="race board 2028" className="flex flex-col gap-3">
        <SectionHeader
          id="board"
          subtitle={
            board2028Mode === 'results'
              ? 'Every 2028 race for president, Senate, governor and House, by who won it.'
              : board2028Mode === 'frozen'
              ? 'Every 2028 race as the results come in, in the columns our markets put them in before the polls opened.'
              : 'Every 2028 race for president, Senate, governor and House, by how our markets rate it.'
          }
        >
          {board2028Mode === 'live' ? 'Every race' : '2028 results'}
        </SectionHeader>
        <RaceBoard
          races={board2028}
          mode={board2028Mode}
          freezeTime={BOARD_FREEZE[2028]}
          cycle={2028}
          trackingName="election 2028 board"
        />
      </SectionInView>
    ),

    primaries: (primaries.length > 0 || primaryContracts.length > 0) && (
      <SectionInView section="2028 primaries" className="flex flex-col gap-3">
        <SectionHeader
          id="primaries"
          subtitle="Who leads each party's contest in every state, the early states first."
        >
          The primaries
        </SectionHeader>
        {primaries.length > 0 && <PrimariesBoard rows={primaries} />}
        {primaryContracts.length > 0 && (
          <MarketSpotlightGrid
            contracts={primaryContracts}
            trackingPostfix="election 2028 primaries"
          />
        )}
      </SectionInView>
    ),

    trending: trendingContracts.length > 0 && (
      <SectionInView section="2028 trending" className="flex flex-col gap-3">
        <SectionHeader subtitle="The 2028 markets traders are most active in right now.">
          Trending
        </SectionHeader>
        <MarketSpotlightGrid
          contracts={trendingContracts}
          trackingPostfix="election 2028 trending"
        />
      </SectionInView>
    ),

    swings2026: swings.length > 0 && (
      <SectionInView section="2026 swings" className="flex flex-col gap-3">
        <SectionHeader
          subtitle="The races Manifold's odds moved most on, from a week out to the result."
          action={
            <Link
              href="/election2026"
              className="text-primary-700 hover:text-primary-800 shrink-0 whitespace-nowrap text-sm font-medium hover:underline"
              onClick={() => track('click election 2026 replay from swings')}
            >
              Replay election night →
            </Link>
          }
        >
          2026&apos;s biggest swings
        </SectionHeader>
        <Swings2026 swings={swings} />
      </SectionInView>
    ),

    offYear: (offYear.length > 0 || before2028World.length > 0) && (
      <SectionInView
        section="off-year elections"
        className="flex flex-col gap-3"
      >
        <SectionHeader
          id="off-year"
          subtitle="Governors and legislatures in the odd years, the Speaker votes, and major elections abroad."
        >
          Off-year elections
        </SectionHeader>
        {offYear.length > 0 && (
          <MarketSpotlightGrid
            contracts={offYear}
            trackingPostfix="election off-year us"
          />
        )}
        {before2028World.length > 0 && (
          <>
            <h3 className="text-ink-900 mt-1 text-base font-semibold">
              Around the world
            </h3>
            <MarketSpotlightGrid
              contracts={before2028World}
              trackingPostfix="election before 2028 world"
            />
          </>
        )}
      </SectionInView>
    ),

    midterms2030: (board2030.length > 0 || balanceOfPower2030) && (
      <SectionInView section="2030 midterms" className="flex flex-col gap-3">
        <SectionHeader
          id="midterms-2030"
          subtitle="Who controls Washington after the midterms, and every Senate and governor race."
        >
          The 2030 midterms
        </SectionHeader>
        {balanceOfPower2030 && (
          <BalanceOfPower
            contract={balanceOfPower2030}
            title="Who controls Washington after 2030"
          />
        )}
        {board2030.length > 0 && (
          <RaceBoard
            races={board2030}
            mode={board2030Mode}
            freezeTime={BOARD_FREEZE[2030]}
            cycle={2030}
            trackingName="election 2030 board"
          />
        )}
      </SectionInView>
    ),

    later: later.length > 0 && (
      <SectionInView section="later cycles" className="flex flex-col gap-3">
        <SectionHeader
          id="later"
          subtitle="Control of Washington after each election, and the 2032 and 2036 presidential races."
        >
          {phase === 'midterms2030' ? '2032 and beyond' : '2030 and beyond'}
        </SectionHeader>
        <MarketSpotlightGrid
          contracts={later}
          trackingPostfix="election later"
        />
      </SectionInView>
    ),

    matrix: presidencyMatrixRows.length > 0 && (
      <SectionInView
        section="conditional matrix 2028"
        className="flex flex-col gap-3"
      >
        <SectionHeader subtitle="The same questions, asked under a Democratic and a Republican president. Click a chance to bet on it.">
          What the 2028 winner would change
        </SectionHeader>
        <PresidencyMatrix
          rows={presidencyMatrixRows}
          partyContract={partyContract}
        />
      </SectionInView>
    ),

    unprecedented: unprecedentedContracts.length > 0 && (
      <SectionInView
        section="unprecedented politics"
        className="flex flex-col gap-3"
      >
        <SectionHeader subtitle="Things that have never happened in American politics, with the market's live odds that they do.">
          Unprecedented politics
        </SectionHeader>
        <MarketSpotlightGrid
          contracts={unprecedentedContracts}
          trackingPostfix="election unprecedented"
        />
      </SectionInView>
    ),

    polling: pollingPerpContracts.length > 0 && (
      <SectionInView section="polling" className="flex flex-col gap-3">
        <SectionHeader subtitle="VoteHub's live polling averages. Bet on whether they go higher or lower.">
          Polling averages
        </SectionHeader>
        <PollingPerpsRow contracts={pollingPerpContracts} />
      </SectionInView>
    ),

    feed: (
      <SectionInView section="feed" className="flex flex-col gap-3">
        <SectionHeader>More election markets</SectionHeader>
        <Search
          key={feedTopic.slug}
          persistPrefix="election-2028-page-markets"
          topicSlug={feedTopic.slug}
          contractsOnly
          hideSearchTypes
          useUrlParams={false}
          defaultSort="most-popular"
          defaultFilter="open"
          extraFilterPills={feedTopics.map((t) => (
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
    ),
  }

  return (
    <div
      className={clsx(
        interactions.scope,
        'isolate mb-10 flex flex-col gap-8 px-1 sm:px-2'
      )}
    >
      <div className="flex items-center gap-2 pt-3 sm:pt-1">
        <BackButton homeFallback className="lg:hidden" />
        <div className="flex flex-col">
          <h1 className="text-ink-1000 text-3xl font-semibold sm:text-4xl">
            Elections
          </h1>
          <div className="text-ink-600 text-sm sm:text-base">
            {phase === 'midterms2030'
              ? 'Live odds on the 2030 midterms and every race after'
              : 'Live odds on 2028 and every race on the way there'}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {hubTopic && <SportTopicMenu topic={hubTopic} />}
          <CopyLinkOrShareButton
            url={shareUrl}
            eventTrackingName="share elections page"
            tooltip="Share this page"
            color="gray-outline"
            size="sm"
            className="shrink-0 gap-1.5"
          >
            Share
          </CopyLinkOrShareButton>
        </div>
      </div>

      {sectionOrder(phase).map((key) =>
        sections[key] ? <Fragment key={key}>{sections[key]}</Fragment> : null
      )}
    </div>
  )
}

const MATRIX_FOOTNOTE =
  "Each market resolves N/A if its condition doesn't happen, so bets only count in that world."

function PresidencyMatrix(props: {
  rows: ConditionalMatrixRow[]
  partyContract: Elections2028PageProps['partyContract']
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
