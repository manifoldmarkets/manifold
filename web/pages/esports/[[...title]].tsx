import { keyBy } from 'lodash'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ReactNode, useEffect, useMemo } from 'react'

import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { CURATED_SPORTS } from 'common/sports-schedule'
import { buildArray } from 'common/util/array'
import { Col } from 'web/components/layout/col'
import { QueryUncontrolledTabs, Tab } from 'web/components/layout/tabs'
import { EsportsEventHero } from 'web/components/sports/esports/esports-event-hero'
import { EsportsGameChips } from 'web/components/sports/esports/esports-game-chips'
import {
  ESPORTS_GAMES,
  esportsGameByKey,
  EsportsGameInfo,
  EsportsGameKey,
  esportsGameLabel,
  esportsPath,
} from 'web/components/sports/esports/esports-games'
import { orderTournaments } from 'web/components/sports/esports/esports-order'
import { EsportsSeasonStrip } from 'web/components/sports/esports/esports-season-strip'
import { SportMarkets, SportsShell } from 'web/components/sports/sports-shell'
import { useSportTopicExtras } from 'web/components/sports/use-sport-topic'
import { useEsportsTournaments } from 'web/hooks/use-esports-tournaments'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useSportsSchedule } from 'web/hooks/use-sports-schedule'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import Custom404 from 'web/pages/404'

/** The sports pages' key for esports: the rail's chip, the topic, the boards. */
const ESPORTS_SPORT = 'esports'
const first = (q: string | string[] | undefined) =>
  Array.isArray(q) ? q[0] : q

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

// With the rollout off, every /esports URL answers 404, not a 200 with the
// not-found screen on it. The flag is set at build time, like the page's own
// check below, so the two always agree.
export async function getStaticProps() {
  return isSportsBdlEnabled() ? { props: {} } : { notFound: true }
}

/**
 * Esports tournaments instead of a season's games. /esports/<game> leads
 * with the game's top tournament still to finish (`orderTournaments`), laid
 * out from the series the data feed reported, then its others. The bare URL
 * goes to the first game with a tournament in progress. Only with the
 * BALLDONTLIE rollout on: /sports/esports, the esports sport's own page, is
 * unchanged either way.
 */
export default function EsportsRoute() {
  return isSportsBdlEnabled() ? <EsportsPage /> : <Custom404 />
}

function EsportsPage() {
  const user = useUser()
  useSaveReferral(user)
  useSaveScroll('esports', true)
  const router = useRouter()
  const raw = first(router.query.title)?.toLowerCase()
  const game = esportsGameByKey(raw)
  // The page is built per URL, so the server knows the game in it as well:
  // waiting on `router.isReady` here would render one thing on the server
  // and another on the first client render.
  const unknown = !!raw && !game
  const eventId = Number(first(router.query.event))

  useEffect(() => {
    if (!router.isReady || unknown) return
    const search = window.location.search
    // One URL per game.
    if (game && first(router.query.title) !== game.key)
      router.replace(esportsPath(game.key) + search)
    if (raw) return
    let cancelled = false
    findGameInPlay().then((key) => {
      if (!cancelled) router.replace(esportsPath(key) + search)
    })
    return () => {
      cancelled = true
    }
  }, [router.isReady, raw])

  // The shell and the tabs after Tournaments are the esports sport's own, as
  // on any sport's page: the rail, Follow, its markets and its leaderboards.
  const { schedule, rail } = useSportsSchedule(ESPORTS_SPORT, router.isReady)
  const sports = rail?.sports ?? CURATED_SPORTS
  const sportsByKey = useMemo(() => keyBy(sports, 'key'), [sports])
  const sport = sportsByKey[ESPORTS_SPORT]
  const scope = useMemo(() => sport && { sport }, [sport])
  const topic = useSportTopicExtras(scope)
  const name = game ? esportsGameLabel(game.game) : 'Esports'
  const markets = sport && (
    <SportMarkets
      sport={sport}
      upcoming={schedule?.upcoming ?? []}
      sportsByKey={sportsByKey}
      enabled={router.isReady}
    />
  )

  return (
    <SportsShell
      selected={ESPORTS_SPORT}
      rail={rail}
      heading={unknown ? 'Game not found' : name}
      subheading={
        // The shell keeps its subheading to one line. On a phone this one
        // doesn't fit, so it wraps rather than lose its end.
        <span className="whitespace-normal">
          {topic.notice ||
            'Tournaments as they stand, every series priced by the crowd.'}
        </span>
      }
      actions={topic.follow}
      seo={{
        title: game ? `${name} tournaments and markets` : 'Esports',
        description: `Brackets, standings and live odds on every ${
          game ? name : 'esports'
        } series.`,
        url: esportsPath(game?.key),
      }}
      trackPageView={`/esports/${game?.key ?? ''}`}
    >
      <QueryUncontrolledTabs
        trackingName="esports tabs"
        tabs={buildArray<Tab>(
          {
            title: 'Tournaments',
            queryString: 'tournaments',
            content: (
              <Col className="gap-4 pt-3">
                <EsportsGameChips selected={game?.key} />
                {unknown ? (
                  <Notice title={`We don't have a game called "${raw}".`}>
                    Pick a game above, or see{' '}
                    <Link href="/sports" className="text-primary-700">
                      every sport
                    </Link>
                    .
                  </Notice>
                ) : game ? (
                  <Tournaments
                    key={game.key}
                    game={game}
                    eventId={eventId}
                    whenEmpty={markets}
                  />
                ) : (
                  <Skeleton />
                )}
              </Col>
            ),
          },
          markets && {
            title: 'Markets',
            queryString: 'markets',
            content: <div className="pt-3">{markets}</div>,
          },
          topic.tabs
        )}
      />
    </SportsShell>
  )
}

/** The first game with a tournament in progress, or else the first game. */
async function findGameInPlay(): Promise<EsportsGameKey> {
  const results = await Promise.allSettled(
    ESPORTS_GAMES.map(({ game }) => api('get-esports-tournaments', { game }))
  )
  const inPlay = results.findIndex(
    (r) =>
      r.status === 'fulfilled' &&
      r.value.tournaments.some((t) => t.status === 'in-progress')
  )
  return ESPORTS_GAMES[Math.max(inPlay, 0)].key
}

/** One game's tournaments: the one to lead with in full, the rest as cards. */
function Tournaments(props: {
  game: EsportsGameInfo
  eventId: number
  /** Under the notice when the game has no tournaments: the esports markets. */
  whenEmpty: ReactNode
}) {
  const { game, eventId, whenEmpty } = props
  const { tournaments, markets, failed } = useEsportsTournaments(game.game)
  if (!tournaments)
    return failed ? (
      <Notice title="Couldn't load the tournaments.">
        Reload the page to try again.
      </Notice>
    ) : (
      <Skeleton />
    )
  const ordered = orderTournaments(tournaments)
  const featured =
    ordered.find((v) => v.tournament.id === eventId) ?? ordered[0]
  if (!featured)
    return (
      <Col className="gap-6">
        <Notice
          title={`No ${esportsGameLabel(
            game.game,
            true
          )} tournaments right now`}
        >
          A tournament shows up here once its series have official markets.
        </Notice>
        {whenEmpty}
      </Col>
    )
  return (
    <Col className="gap-6">
      <EsportsEventHero
        key={featured.tournament.id}
        view={featured}
        markets={markets}
      />
      <EsportsSeasonStrip
        views={ordered.filter((v) => v !== featured)}
        gameKey={game.key}
      />
    </Col>
  )
}

function Notice(props: { title: string; children: ReactNode }) {
  return (
    <Col className="border-ink-200 bg-canvas-0 gap-1.5 rounded-lg border px-4 py-4">
      <span className="text-ink-900 text-sm font-semibold">{props.title}</span>
      <span className="text-ink-500 text-xs">{props.children}</span>
    </Col>
  )
}

function Skeleton() {
  return (
    <Col className="gap-3">
      <div className="bg-ink-100 h-28 animate-pulse rounded-2xl" />
      <div className="bg-ink-100 h-40 animate-pulse rounded-xl" />
    </Col>
  )
}
