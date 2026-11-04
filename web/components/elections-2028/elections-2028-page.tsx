import clsx from 'clsx'
import Link from 'next/link'
import { ReactNode, useState } from 'react'

import { ENV_CONFIG } from 'common/envs/constants'
import { referralQuery } from 'common/util/share'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { BackButton } from 'web/components/contract/back-button'
import { Search } from 'web/components/search'
import { FilterPill } from 'web/components/search/filter-pills'
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
import { PRESIDENTIAL_2028_TOPIC_SLUG } from 'web/lib/politics/elections-2028-config'
import { track } from 'web/lib/service/analytics'
import { buildShareUrl } from 'web/lib/util/share-url'
import { AccuracyBanner } from './accuracy-banner'
import { CandidateBars } from './candidate-bars'
import { MoversStrip } from './movers-strip'
import { PartyOddsBar } from './party-odds-bar'
import { RaceCard, RangePicker, useRange } from './race-section'
import { RoadAhead } from './road-ahead'
import { RoadTo270 } from './road-to-270'
import { Swings2026 } from './swings-2026'

// /election after the 2026 midterms: the 2028 presidential race and every
// election on the way to it, plus 2030 and 2032. Sections render only when
// their markets loaded, so a missing market drops a card, never the page.

const FEED_TOPICS = [
  { slug: PRESIDENTIAL_2028_TOPIC_SLUG, label: '2028 President' },
  { slug: 'elections', label: 'All elections' },
  { slug: 'us-politics', label: 'US politics' },
  { slug: 'us-senate', label: 'Senate' },
  { slug: 'donald-trump', label: 'Trump' },
]

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
    partyContract,
    popularVoteContract,
    congressContract,
    charts,
    movers,
    demVpContract,
    gopVpContract,
    ticketContract,
    model,
    accuracy,
    swings,
    primaryContracts,
    before2028Us,
    before2028World,
    contracts2030,
    contracts2032,
    presidencyMatrixRows,
    unprecedentedContracts,
    pollingPerpContracts,
    trendingContracts,
  } = props
  const [range, setRange] = useRange()
  const [feedTopic, setFeedTopic] = useState(FEED_TOPICS[0])
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
            Live odds on 2028 and every race on the way there
          </div>
        </div>
        <CopyLinkOrShareButton
          url={shareUrl}
          eventTrackingName="share elections page"
          tooltip="Share this page"
          color="gray-outline"
          size="sm"
          className="ml-auto shrink-0 gap-1.5"
        >
          Share
        </CopyLinkOrShareButton>
      </div>

      <AccuracyBanner story={accuracy} />

      <RoadAhead now={now} />

      <SectionInView section="2028 race" className="flex flex-col gap-4">
        <SectionHeader
          subtitle="Who wins the White House, and who gets nominated, from Manifold's most-traded 2028 markets."
          action={<RangePicker value={range} onChange={setRange} />}
        >
          The race for 2028
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
        {(popularVoteContract || congressContract) && (
          <div className="grid gap-4 md:grid-cols-2">
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
        )}
      </SectionInView>

      {movers.length > 0 && (
        <SectionInView section="2028 movers" className="flex flex-col gap-3">
          <SectionHeader subtitle="The biggest moves in the 2028 races over the last seven days.">
            Biggest movers this week
          </SectionHeader>
          <MoversStrip movers={movers} charts={charts} />
        </SectionInView>
      )}

      {(demVpContract || gopVpContract || ticketContract) && (
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
      )}

      {model && (
        <SectionInView section="road to 270" className="flex flex-col gap-3">
          <SectionHeader subtitle="Our electoral college model, built from Manifold's state-by-state markets.">
            The road to 270
          </SectionHeader>
          <RoadTo270 model={model} partyContract={partyContract} />
        </SectionInView>
      )}

      {trendingContracts.length > 0 && (
        <SectionInView section="2028 trending" className="flex flex-col gap-3">
          <SectionHeader subtitle="The 2028 markets traders are most active in right now.">
            Trending
          </SectionHeader>
          <MarketSpotlightGrid
            contracts={trendingContracts}
            trackingPostfix="election 2028 trending"
          />
        </SectionInView>
      )}

      {primaryContracts.length > 0 && (
        <SectionInView section="2028 primaries" className="flex flex-col gap-3">
          <SectionHeader subtitle="Who runs, and who wins the early states.">
            The road to the nominations
          </SectionHeader>
          <MarketSpotlightGrid
            contracts={primaryContracts}
            trackingPostfix="election 2028 primaries"
          />
        </SectionInView>
      )}

      {swings.length > 0 && (
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
      )}

      {(before2028Us.length > 0 || before2028World.length > 0) && (
        <SectionInView section="before 2028" className="flex flex-col gap-3">
          <SectionHeader subtitle="Off-year races, the new Congress's Speaker vote, and major elections abroad.">
            Before 2028
          </SectionHeader>
          {before2028Us.length > 0 && (
            <MarketSpotlightGrid
              contracts={before2028Us}
              trackingPostfix="election before 2028 us"
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
      )}

      {(contracts2030.length > 0 || contracts2032.length > 0) && (
        <SectionInView section="2030 and 2032" className="flex flex-col gap-3">
          <SectionHeader subtitle="The 2030 midterms and the 2032 presidential race.">
            2030 and 2032
          </SectionHeader>
          <MarketSpotlightGrid
            contracts={[...contracts2030, ...contracts2032]}
            trackingPostfix="election 2030 2032"
          />
        </SectionInView>
      )}

      {presidencyMatrixRows.length > 0 && (
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
      )}

      {unprecedentedContracts.length > 0 && (
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
      )}

      {pollingPerpContracts.length > 0 && (
        <SectionInView section="polling" className="flex flex-col gap-3">
          <SectionHeader subtitle="VoteHub's live polling averages. Bet on whether they go higher or lower.">
            Polling averages
          </SectionHeader>
          <PollingPerpsRow contracts={pollingPerpContracts} />
        </SectionInView>
      )}

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
          extraFilterPills={FEED_TOPICS.map((t) => (
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
