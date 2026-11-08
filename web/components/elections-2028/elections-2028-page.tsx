import clsx from 'clsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { groupBy, sortBy } from 'lodash'
import { Fragment, ReactNode, useEffect, useMemo, useState } from 'react'

import { getAnswerProbability } from 'common/calculate'
import { Contract, contractPath, isMultiCpmm } from 'common/contract'
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
import { PollingPerpsRow } from 'web/components/us-elections/polling-perps-row'
import { SectionInView } from 'web/components/us-elections/section-in-view'
import { formatOdds } from 'web/components/usa-map/election-display'
import { getPartyProbs } from 'web/components/usa-map/state-election-map'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useUser } from 'web/hooks/use-user'
import {
  ConditionalMatrixRow,
  PRESIDENT_2028_COLUMNS,
  withConditionProbs,
} from 'web/lib/politics/conditional-matrix'
import {
  hasSection,
  pageContents,
  SECTION_IDS,
  sectionTitle,
  sectionWhen,
} from 'web/lib/politics/election-contents'
import {
  MARKET_LABELS,
  More2028Place,
  placeMore2028,
  sideTotal,
} from 'web/lib/politics/election-glance'
import { SectionKey, sectionOrder } from 'web/lib/politics/election-phase'
import type { Elections2028PageProps } from 'web/lib/politics/elections-2028'
import {
  BOARD_FREEZE,
  ELECTION_HUB_TOPICS,
  PRESIDENTIAL_2028_TOPIC_SLUG,
} from 'web/lib/politics/elections-2028-config'
import { track } from 'web/lib/service/analytics'
import { buildShareUrl } from 'web/lib/util/share-url'
import { AccuracyBanner, REPLAY_LINK } from './accuracy-banner'
import { BalanceOfPower } from './balance-of-power'
import { CandidateBars } from './candidate-bars'
import { ContentsStrip } from './contents-nav'
import { ElectionLeaderboards } from './election-leaderboards'
import { ElectionMap } from './election-map'
import { FutureCycles } from './future-cycles'
import { OddsItem, OddsRows, oddsItems } from './odds-rows'
import { OddsStrip } from './odds-strip'
import { OffYearMap } from './off-year-map'
import { PartyOddsBar } from './party-odds-bar'
import { PrimariesOverview } from './primaries-overview'
import { RaceBoard } from './race-board'
import { RaceCard, RangePicker, useRange } from './race-section'
import { Swings2026 } from './swings-2026'

// /election from the 2026 midterms to the 2030 ones: the 2028 race, every
// election on the way, and the cycles after. The section order follows the
// calendar (election-phase.ts), so the page needs no edits as it moves from
// the nomination race to primaries, conventions, the general, results and
// the 2030 midterms. Sections render only when their markets loaded, so a
// missing market drops a card, never the page; the contents (the right
// margin, a strip on phones) lists the same sections from the same checks
// (election-contents.ts). Every section is a picture of its markets (a map,
// strips, faces, a grid), not a wall of market cards; what doesn't need one
// is a line each.

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

const CARD = 'bg-canvas-0 border-ink-200 rounded-xl border p-4'

// A section's heading: its date first where the calendar sets one, then the
// title (the contents' anchor) and a line on what's in it.
function SectionHeader(props: {
  section: SectionKey
  now: number
  phase: Elections2028PageProps['phase']
  subtitle?: ReactNode
  action?: ReactNode
}) {
  const { section, now, phase } = props
  const when = sectionWhen(section, now, phase)
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
      <div className="flex flex-col gap-0.5">
        {when && (
          <span className="text-primary-700 text-xs font-semibold uppercase tracking-wide">
            {when}
          </span>
        )}
        <h2
          id={SECTION_IDS[section]}
          className="text-ink-1000 scroll-mt-16 text-xl font-semibold sm:text-2xl lg:scroll-mt-4"
        >
          {sectionTitle(section, phase)}
        </h2>
        {props.subtitle && (
          <div className="text-ink-600 text-sm">{props.subtitle}</div>
        )}
      </div>
      {props.action}
    </div>
  )
}

// The tipping-point market's likeliest states, one line each.
function tippingRows(contract: Contract): OddsItem[] {
  if (!isMultiCpmm(contract)) return []
  return sortBy(
    contract.answers
      .filter((a) => !/^other\b/i.test(a.text.trim()))
      .map((a) => ({ a, p: getAnswerProbability(contract, a.id) })),
    (x) => -x.p
  )
    .slice(0, 6)
    .map(({ a, p }) => ({
      key: a.id,
      label: a.text,
      p,
      href: contractPath(contract),
    }))
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
    marketKeys,
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

  const contents = useMemo(() => pageContents(props), [props])
  // The 2028 markets with no slot of their own, by where they're drawn.
  const placed = groupBy(more2028, (c) =>
    placeMore2028(marketKeys[c.id])
  ) as Partial<Record<More2028Place, Contract[]>>
  const labelOf = (c: { id: string }) => MARKET_LABELS[marketKeys[c.id] ?? '']
  const head = (section: SectionKey) => ({ section, now, phase })

  // Every section, once; the phase decides which show and in what order
  // (election-phase.ts), and hasSection whether it has anything to show.
  const sections: Record<SectionKey, () => ReactNode> = {
    accuracy: () => <AccuracyBanner story={accuracy} />,

    leaderboards: () => (
      <ElectionLeaderboards
        boards={leaderboards}
        defaultKey={leaderboardDefault}
      />
    ),

    race: () => (
      <SectionInView section="2028 race" className="flex flex-col gap-4">
        <SectionHeader
          {...head('race')}
          subtitle={
            results
              ? 'Who won the White House, and the odds that got them there.'
              : 'Who wins the White House, and who gets nominated.'
          }
          action={<RangePicker value={range} onChange={setRange} />}
        />
        {partyContract && (
          <div className="bg-canvas-0 border-ink-200 rounded-xl border px-4 py-3">
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
      </SectionInView>
    ),

    map: () => (
      <SectionInView section="2028 map" className="flex flex-col gap-3">
        <SectionHeader
          {...head('map')}
          subtitle="Every race by our odds, and the road to 270. Hover a state for its odds; click it for every market there."
        />
        <ElectionMap
          races={board2028}
          primaries={primaries}
          offYear={offYear}
          defaultMode={phase === 'primaries' ? 'primary' : 'president'}
          model={model}
          partyContract={partyContract}
        />
      </SectionInView>
    ),

    national: () => {
      const margin = placed.margin?.[0]
      const electoralVotes = placed.electoralVotes?.[0]
      const tipping = placed.tippingPoint?.[0]
      const facts = oddsItems(placed.facts ?? [], labelOf)
      const tippingItems = tipping ? tippingRows(tipping) : []
      return (
        <SectionInView section="2028 national" className="flex flex-col gap-4">
          <SectionHeader
            {...head('national')}
            subtitle="Who controls Washington after 2028, the popular vote, and how big the win is."
          />
          <div className="grid items-start gap-4 md:grid-cols-2">
            {balanceOfPowerContract && (
              <BalanceOfPower
                contract={balanceOfPowerContract}
                title="Who controls Washington after 2028"
              />
            )}
            <div className="flex flex-col gap-4">
              {(popularVoteContract || margin) && (
                <div className={clsx(CARD, 'flex flex-col gap-4')}>
                  {popularVoteContract && (
                    <PartyOddsBar
                      contract={popularVoteContract}
                      label="Who wins the popular vote"
                      trackingName="election 2028 popular vote"
                      size="sm"
                    />
                  )}
                  {margin && (
                    <OddsStrip
                      contract={margin}
                      title="By how much"
                      threshold={0}
                      thresholdLabel="Even"
                      summary={(b) => {
                        const top = b.reduce((x, y) => (y.p > x.p ? y : x))
                        return (
                          <>
                            Most likely{' '}
                            <b className="text-ink-1000">{top.text}</b> (
                            {formatOdds(top.p)})
                          </>
                        )
                      }}
                    />
                  )}
                </div>
              )}
              {electoralVotes && (
                <div className={CARD}>
                  <OddsStrip
                    contract={electoralVotes}
                    title="The Democratic nominee's electoral votes"
                    threshold={270}
                    thresholdLabel="270"
                    summary={(b) => (
                      <>
                        270 or more:{' '}
                        <b className="text-ink-1000">
                          {formatOdds(sideTotal(b, 'D'))}
                        </b>
                      </>
                    )}
                  />
                </div>
              )}
              {congressContract && (
                <div className={CARD}>
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
          {(tippingItems.length > 0 || facts.length > 0) && (
            <div
              className={clsx(
                'grid items-start gap-4',
                tippingItems.length > 0 && facts.length > 0 && 'md:grid-cols-2'
              )}
            >
              {tipping && tippingItems.length > 0 && (
                <div className={clsx(CARD, 'flex flex-col gap-1')}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-ink-1000 text-sm font-semibold">
                      The tipping-point state
                    </h3>
                    <Link
                      href={contractPath(tipping)}
                      className="text-ink-500 hover:text-primary-700 shrink-0 text-xs hover:underline"
                    >
                      Market →
                    </Link>
                  </div>
                  <OddsRows
                    items={tippingItems}
                    columns={1}
                    trackingName="election 2028 tipping point"
                  />
                </div>
              )}
              {facts.length > 0 && (
                <div className={clsx(CARD, 'flex flex-col gap-1')}>
                  <h3 className="text-ink-1000 text-sm font-semibold">
                    Also on 2028
                  </h3>
                  <OddsRows
                    items={facts}
                    columns={1}
                    trackingName="election 2028 facts"
                  />
                </div>
              )}
            </div>
          )}
        </SectionInView>
      )
    },

    runningMates: () => (
      <SectionInView
        section="2028 running mates"
        className="flex flex-col gap-3"
      >
        <SectionHeader
          {...head('runningMates')}
          subtitle="Each party's pick for vice president, who ends up on the winning ticket, and whether a convention goes past its first ballot."
        />
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
        {placed.conventions && (
          <div className={CARD}>
            <OddsRows
              items={oddsItems(placed.conventions, labelOf)}
              trackingName="election 2028 conventions"
            />
          </div>
        )}
      </SectionInView>
    ),

    board: () => (
      <SectionInView section="race board 2028" className="flex flex-col gap-3">
        <SectionHeader
          {...head('board')}
          subtitle={
            board2028Mode === 'results'
              ? 'Every 2028 race for president, Senate, governor and House, by who won it.'
              : board2028Mode === 'frozen'
              ? 'Every 2028 race as the results come in, in the columns our markets put them in before the polls opened.'
              : 'Every 2028 race for president, Senate, governor and House, by how our markets rate it.'
          }
        />
        <RaceBoard
          races={board2028}
          mode={board2028Mode}
          freezeTime={BOARD_FREEZE[2028]}
          cycle={2028}
          trackingName="election 2028 board"
        />
      </SectionInView>
    ),

    primaries: () => (
      <SectionInView section="2028 primaries" className="flex flex-col gap-3">
        <SectionHeader
          {...head('primaries')}
          subtitle="Who runs, and who leads each party's contest in the early states."
        />
        <PrimariesOverview rows={primaries} fields={primaryContracts} />
      </SectionInView>
    ),

    trending: () => (
      <SectionInView section="2028 trending" className="flex flex-col gap-3">
        <SectionHeader
          {...head('trending')}
          subtitle="The 2028 markets traders are most active in right now."
        />
        <div className={CARD}>
          <OddsRows
            items={oddsItems(trendingContracts)}
            trackingName="election 2028 trending"
          />
        </div>
      </SectionInView>
    ),

    swings2026: () => (
      <SectionInView section="2026 swings" className="flex flex-col gap-3">
        <SectionHeader
          {...head('swings2026')}
          subtitle="The races Manifold's odds moved most on, from a week out to the result."
          action={
            <Link
              href="/election2026"
              className="text-primary-700 hover:text-primary-800 shrink-0 whitespace-nowrap text-sm font-medium hover:underline"
              onClick={() => track('click election 2026 replay from swings')}
            >
              {REPLAY_LINK} →
            </Link>
          }
        />
        <div className={CARD}>
          <Swings2026 swings={swings} />
        </div>
      </SectionInView>
    ),

    offYear: () => (
      <SectionInView
        section="off-year elections"
        className="flex flex-col gap-3"
      >
        <SectionHeader
          {...head('offYear')}
          subtitle="Governors and legislatures in the odd years, the Speaker vote, and major elections abroad."
        />
        <OffYearMap contracts={offYear} world={before2028World} />
      </SectionInView>
    ),

    midterms2030: () => (
      <SectionInView section="2030 midterms" className="flex flex-col gap-3">
        <SectionHeader
          {...head('midterms2030')}
          subtitle="Who controls Washington after the midterms, and every Senate and governor race."
        />
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

    later: () => (
      <SectionInView section="later cycles" className="flex flex-col gap-3">
        <SectionHeader
          {...head('later')}
          subtitle="Which party holds the White House, Senate and House after each election, and the 2032 race."
        />
        <div className={CARD}>
          <FutureCycles contracts={later} marketKeys={marketKeys} />
        </div>
      </SectionInView>
    ),

    matrix: () => (
      <SectionInView
        section="conditional matrix 2028"
        className="flex flex-col gap-3"
      >
        <SectionHeader
          {...head('matrix')}
          subtitle="The same questions, asked under a Democratic and a Republican president. Click a chance to bet on it."
        />
        <PresidencyMatrix
          rows={presidencyMatrixRows}
          partyContract={partyContract}
        />
      </SectionInView>
    ),

    unprecedented: () => (
      <SectionInView
        section="unprecedented politics"
        className="flex flex-col gap-3"
      >
        <SectionHeader
          {...head('unprecedented')}
          subtitle="Things that have never happened in American politics, with the market's live odds that they do."
        />
        <div className={CARD}>
          <OddsRows
            items={oddsItems(unprecedentedContracts)}
            trackingName="election unprecedented"
          />
        </div>
      </SectionInView>
    ),

    polling: () => (
      <SectionInView section="polling" className="flex flex-col gap-3">
        <SectionHeader
          {...head('polling')}
          subtitle="VoteHub's live polling averages. Bet on whether they go higher or lower."
        />
        <PollingPerpsRow contracts={pollingPerpContracts} />
      </SectionInView>
    ),

    feed: () => (
      <SectionInView section="feed" className="flex flex-col gap-3">
        <SectionHeader {...head('feed')} />
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
  const order = sectionOrder(phase).filter((key) => hasSection(props, key))
  // On phones the contents strip sits under the 2026 line, or the header.
  const stripAfter = order[0] === 'accuracy' ? 'accuracy' : undefined

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

      {stripAfter === undefined && <ContentsStrip entries={contents} />}
      {order.map((key) => (
        <Fragment key={key}>
          {sections[key]()}
          {key === stripAfter && <ContentsStrip entries={contents} />}
        </Fragment>
      ))}
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
