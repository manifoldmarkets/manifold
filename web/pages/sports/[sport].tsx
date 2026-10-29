import { keyBy, uniq } from 'lodash'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo } from 'react'
import { withoutRaceMarkets } from 'common/race-weekends'
import { CURATED_SPORTS, SPORT_KEY_RE, sportPath } from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { RaceChampionships } from 'web/components/sports/race-championships'
import { GameFeed } from 'web/components/sports/schedule-list'
import {
  NoGames,
  SportMarkets,
  SportsShell,
} from 'web/components/sports/sports-shell'
import { useSportTopicExtras } from 'web/components/sports/use-sport-topic'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useSportsSchedule } from 'web/hooks/use-sports-schedule'
import { useUser } from 'web/hooks/use-user'

/**
 * One sport: its games match by match, each with the markets on it, and a
 * tab for everything else (futures, trending, this week's other markets).
 */
export default function SportPage() {
  const user = useUser()
  useSaveReferral(user)
  const router = useRouter()
  const raw = Array.isArray(router.query.sport)
    ? router.query.sport[0]
    : router.query.sport
  const key =
    raw && SPORT_KEY_RE.test(raw.toLowerCase()) ? raw.toLowerCase() : undefined
  useSaveScroll(`sports-${key ?? ''}`, true)
  // One URL per sport.
  useEffect(() => {
    if (raw && key && raw !== key) router.replace(sportPath(key))
  }, [raw, key])

  const ready = router.isReady && !!key
  const { schedule, rail, loading, loadMore, hasMore } = useSportsSchedule(
    key ?? 'all',
    ready
  )
  const sports = rail?.sports ?? CURATED_SPORTS
  const sportsByKey = useMemo(() => keyBy(sports, 'key'), [sports])
  const sport = key ? sportsByKey[key] : undefined
  const topic = useSportTopicExtras(sport)
  // Only judge once this sport's own response is in.
  const unknown = router.isReady && (!key || (!!schedule && !sport))

  const games = schedule?.games ?? []
  // Tag cards with their league only when the sport has several (soccer).
  const showLeague = uniq(games.map((g) => g.league)).length > 1
  // F1's weekends (the API sends them only for F1): each session in the feed,
  // the next one featured, and the title fight under it.
  const weekends = schedule?.raceWeekends ?? []
  const isF1 = key === 'f1'
  const championships = schedule?.raceChampionships ?? []
  const titleFight = championships.length > 0 && (
    <RaceChampionships championships={championships} />
  )

  if (unknown) {
    return (
      <SportsShell
        selected="all"
        rail={rail}
        heading="Sport not found"
        subheading="Pick a sport below, or see every game."
        seo={{ title: 'Sports', description: '', url: '/sports' }}
        trackPageView="/sports/unknown"
      >
        <Col className="border-ink-200 bg-canvas-0 mt-3 gap-1.5 rounded-lg border px-4 py-4">
          <span className="text-ink-900 text-sm font-semibold">
            We don't have a sport called "{raw}".
          </span>
          <Link href="/sports" className="text-primary-700 text-sm">
            See every game →
          </Link>
        </Col>
      </SportsShell>
    )
  }

  const markets = (
    <SportMarkets
      sport={sport ?? 'all'}
      upcoming={withoutRaceMarkets(schedule?.upcoming ?? [], weekends)}
      sportsByKey={sportsByKey}
      enabled={ready && !!sport}
    />
  )

  return (
    <SportsShell
      selected={key ?? 'all'}
      rail={rail}
      heading={
        sport ? (
          <>
            <span className="mr-2">{sport.emoji}</span>
            {/* The rail's short label fits beside the back arrow on phones. */}
            <span className="sm:hidden">{sport.label}</span>
            <span className="hidden sm:inline">{sport.longLabel}</span>
          </>
        ) : (
          <span className="bg-ink-100 inline-block h-7 w-40 animate-pulse rounded align-middle" />
        )
      }
      subheading={
        sport ? `Every ${sport.label} game, plus props and futures.` : undefined
      }
      actions={topic.follow}
      seo={{
        title: sport ? `${sport.longLabel} games and markets` : 'Sports',
        description: sport
          ? `Live odds on every ${sport.label} game, plus props, futures and side-bets.`
          : '',
        url: key ? sportPath(key) : '/sports',
      }}
      trackPageView={`/sports/${key ?? ''}`}
    >
      <QueryUncontrolledTabs
        trackingName="sport tabs"
        tabs={[
          {
            title: 'Games',
            queryString: 'games',
            content: (
              <div className="pt-3">
                <GameFeed
                  key={key}
                  games={games}
                  raceWeekends={weekends}
                  featureNext={isF1}
                  fullRaceHero={isF1}
                  belowFeatured={titleFight}
                  loading={loading || !schedule}
                  hasMore={hasMore}
                  loadMore={loadMore}
                  showLeague={showLeague}
                  empty={
                    <div className="flex flex-col gap-6">
                      {titleFight}
                      <NoGames
                        sport={sport}
                        sports={sports}
                        counts={rail?.counts ?? {}}
                      />
                      {markets}
                    </div>
                  }
                />
              </div>
            ),
          },
          {
            title: 'Markets',
            queryString: 'markets',
            content: <div className="pt-3">{markets}</div>,
          },
          ...topic.tabs,
        ]}
      />
    </SportsShell>
  )
}
