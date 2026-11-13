import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import {
  ESPORTS_SPORT_KEY,
  ESPORTS_TITLE_BY_KEY,
  ESPORTS_TITLES,
  esportsPath,
  featuredEsportsEvent,
  isEsportsTitleKey,
} from 'common/esports'
import { SportInfo } from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import {
  EsportsEventHero,
  seriesContext,
} from 'web/components/sports/esports/esports-event-hero'
import { TitleMark } from 'web/components/sports/esports/esports-marks'
import { EsportsSeasonStrip } from 'web/components/sports/esports/esports-strips'
import { SeriesCard } from 'web/components/sports/esports/series-card'
import { SportsMarketSections } from 'web/components/sports/sports-market-sections'
import { SportsShell } from 'web/components/sports/sports-shell'
import { useEsports } from 'web/hooks/use-esports'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useUser } from 'web/hooks/use-user'

/**
 * Esports: the sports pages' other world. Games instead of sports, and
 * tournaments instead of seasons: the one on now with its stages, series and
 * title odds, then the rest of the season. /sports/esports/<game> is one game.
 */
export default function EsportsPage() {
  const user = useUser()
  useSaveReferral(user)
  const router = useRouter()
  const q = router.query.title
  const raw = (Array.isArray(q) ? q[0] : q)?.toLowerCase()
  const key = raw && isEsportsTitleKey(raw) ? raw : undefined
  const unknown = router.isReady && !!raw && !key
  useSaveScroll(`esports-${key ?? ''}`, true)
  // One URL per game.
  useEffect(() => {
    if (router.isReady && key && (Array.isArray(q) ? q[0] : q) !== key)
      router.replace(esportsPath(key))
  }, [router.isReady, key])

  const { markets, events } = useEsports(true)
  const title = key ? ESPORTS_TITLE_BY_KEY[key] : undefined
  const views = (events ?? []).filter((v) => !key || v.event.title === key)
  const featured = featuredEsportsEvent(views)
  const rest = views.filter((v) => v !== featured)
  // Series trading in events other than the one up top.
  const moreSeries = rest.flatMap((v) =>
    v.openSeries.map((s) => ({ view: v, series: s }))
  )

  const marketsSport: SportInfo = {
    key: key ?? ESPORTS_SPORT_KEY,
    label: title?.name ?? 'esports',
    longLabel: title?.name ?? 'Esports',
    emoji: '🎮',
    groupIds: title
      ? title.groupIds
      : ESPORTS_TITLES.flatMap((t) => t.groupIds),
    slug: title?.slug,
  }

  const series = !events ? (
    <EsportsSkeleton />
  ) : (
    <Col className="gap-6">
      {featured ? (
        <EsportsEventHero view={featured} markets={markets ?? {}} />
      ) : (
        <Col className="border-ink-200 bg-canvas-0 gap-1.5 rounded-lg border px-4 py-4">
          <span className="text-ink-900 text-sm font-semibold">
            Nothing on in {title?.name ?? 'esports'} right now
          </span>
          <span className="text-ink-500 text-xs">
            Tournaments show up here once the community opens their markets. The
            Markets tab has everything else.
          </span>
        </Col>
      )}
      {moreSeries.length > 0 && (
        <Col className="gap-2">
          <h3 className="text-ink-900 px-1 text-xs font-black uppercase tracking-wider">
            More open series
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {moreSeries.map(({ view, series: s }) => (
              <SeriesCard
                key={s.answerId}
                series={s}
                market={markets?.[s.contractId]}
                title={view.title}
                context={seriesContext(view, s)}
                pairing={view.pairings[s.answerId]}
                advanceTo={view.swiss?.stage.advanceTo}
              />
            ))}
          </div>
        </Col>
      )}
      <EsportsSeasonStrip
        views={rest}
        heading={title ? `More ${title.short}` : 'This season'}
      />
    </Col>
  )

  if (unknown) {
    return (
      <SportsShell
        selected={ESPORTS_SPORT_KEY}
        world="esports"
        rail={undefined}
        heading="Game not found"
        subheading="Pick a game below, or see every esport."
        seo={{ title: 'Esports', description: '', url: esportsPath() }}
        trackPageView="/sports/esports/unknown"
      >
        <Col className="border-ink-200 bg-canvas-0 mt-3 gap-1.5 rounded-lg border px-4 py-4">
          <span className="text-ink-900 text-sm font-semibold">
            We don't have a game called "{raw}".
          </span>
          <Link href={esportsPath()} className="text-primary-700 text-sm">
            See every esport →
          </Link>
        </Col>
      </SportsShell>
    )
  }

  return (
    <SportsShell
      selected={key ? `esports-${key}` : ESPORTS_SPORT_KEY}
      world="esports"
      esportsSelected={key ?? 'all'}
      esportsEvents={events}
      rail={undefined}
      heading={
        title ? (
          <span className="inline-flex items-center gap-2">
            <TitleMark title={title} size="md" className="!h-7 !min-w-[28px]" />
            <span className="sm:hidden">{title.short}</span>
            <span className="hidden sm:inline">{title.name}</span>
          </span>
        ) : (
          'Esports'
        )
      }
      subheading={
        title
          ? `Every ${title.short} series and title market, priced by the crowd.`
          : 'Worlds, Majors and Champions: every series, priced by the crowd.'
      }
      seo={{
        title: title ? `${title.name} esports markets` : 'Esports',
        description: title
          ? `Bet on ${title.name} tournaments: every series, the title odds and props.`
          : 'Bet on esports: League of Legends, VALORANT, CS2, Dota 2 and more. Every series, the title odds and props.',
        url: esportsPath(key),
      }}
      trackPageView={`/sports/esports/${key ?? ''}`}
    >
      <QueryUncontrolledTabs
        trackingName="esports tabs"
        tabs={[
          {
            title: 'Tournaments',
            queryString: 'tournaments',
            content: <div className="pt-3">{series}</div>,
          },
          {
            title: 'Markets',
            queryString: 'markets',
            content: (
              <div className="pt-3">
                <SportsMarketSections sport={marketsSport} enabled />
              </div>
            ),
          },
        ]}
      />
    </SportsShell>
  )
}

function EsportsSkeleton() {
  return (
    <Col className="gap-3">
      <div className="bg-ink-100 h-40 animate-pulse rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="bg-ink-100 h-36 animate-pulse rounded-xl" />
        <div className="bg-ink-100 h-36 animate-pulse rounded-xl" />
      </div>
    </Col>
  )
}
