import { PlusIcon } from '@heroicons/react/solid'
import { keyBy, sortBy } from 'lodash'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo } from 'react'
import {
  AnySportKey,
  CURATED_SPORTS,
  SPORT_KEY_RE,
  SportInfo,
} from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { ScheduleList } from 'web/components/sports/schedule-list'
import { SportRail, SportSelection } from 'web/components/sports/sport-rail'
import { SportsMarketSections } from 'web/components/sports/sports-market-sections'
import { UpcomingMarkets } from 'web/components/sports/upcoming-markets'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useSportsSchedule } from 'web/hooks/use-sports-schedule'
import { useUser } from 'web/hooks/use-user'
import { safeLocalStorage } from 'web/lib/util/local'

// The old page used ?tab=NFL etc.; keep those links working.
const LEGACY_TAB_TO_SPORT: Record<string, SportSelection> = {
  'live/soon': 'all',
  trending: 'all',
  nfl: 'nfl',
  nba: 'nba',
  epl: 'soccer',
  nhl: 'nhl',
  mlb: 'mlb',
}

// Any sport key is accepted here; the schedule's list of sports says which exist.
const isSportSelection = (s: unknown): s is SportSelection =>
  typeof s === 'string' && SPORT_KEY_RE.test(s)

export default function SportsPage() {
  const user = useUser()
  useSaveReferral(user)
  useSaveScroll('sports', true)
  const router = useRouter()

  const [savedSport, setSavedSport, storageReady] =
    usePersistentLocalState<SportSelection>('all', 'sports-page-sport')
  // Fetch only once both the URL and the remembered sport are known, so the
  // page never requests (and flashes) the wrong sport first.
  const ready = router.isReady && (storageReady || !safeLocalStorage)

  const querySport = useMemo((): SportSelection | undefined => {
    if (!router.isReady) return undefined
    const raw = router.query.sport ?? router.query.tab
    const value = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase()
    if (!value) return undefined
    if (Object.prototype.hasOwnProperty.call(LEGACY_TAB_TO_SPORT, value))
      return LEGACY_TAB_TO_SPORT[value]
    return isSportSelection(value) ? value : undefined
  }, [router.isReady, router.query.sport, router.query.tab])

  // Stored values are user data: validate before trusting them.
  const restored: SportSelection = isSportSelection(savedSport)
    ? savedSport
    : 'all'
  const requested: SportSelection = querySport ?? restored
  useEffect(() => {
    if (querySport && querySport !== 'live' && querySport !== savedSport) {
      setSavedSport(querySport)
    }
  }, [querySport])
  // A sport restored from storage shows up in the address bar too, so the
  // page and the URL never disagree.
  useEffect(() => {
    if (!ready || querySport || restored === 'all') return
    router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, sport: restored },
      },
      undefined,
      { shallow: true }
    )
  }, [ready])

  const setSelected = (sport: SportSelection) => {
    // "Live" is a moment, not a preference: remember the sport underneath it.
    setSavedSport(sport === 'live' ? 'all' : sport)
    const query = { ...router.query }
    delete query.tab
    if (sport === 'all') delete query.sport
    else query.sport = sport
    router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }

  const scheduleSport: AnySportKey | 'all' =
    requested === 'live' ? 'all' : requested
  const { schedule, loading } = useSportsSchedule(scheduleSport, ready)
  // Every sport under the Sports topic, once the schedule brings the list.
  const sports = schedule?.sports ?? CURATED_SPORTS
  const sportsByKey = useMemo(() => keyBy(sports, 'key'), [sports])
  // A link or remembered choice for a sport that no longer exists.
  const unknownSport =
    !!schedule &&
    requested !== 'all' &&
    requested !== 'live' &&
    !sportsByKey[requested]
  useEffect(() => {
    if (unknownSport) setSelected('all')
  }, [unknownSport])
  // If nothing is live any more, the Live chip is gone: fall back to All.
  const selected: SportSelection =
    unknownSport ||
    (requested === 'live' && schedule && schedule.liveCount === 0)
      ? 'all'
      : requested
  const games = schedule?.games ?? []
  const upcoming = schedule?.upcoming ?? []
  const hasGames = games.some((g) => g.status !== 'finished')
  const allSports = selected === 'all' || selected === 'live'
  const sport: SportInfo | undefined = allSports
    ? undefined
    : sportsByKey[selected]

  return (
    <Page trackPageView="/sports" className="!col-span-10">
      <SEO
        title="Sports"
        description="Bet on every game: live odds, upcoming schedules, props and futures across the NFL, NBA, MLB, soccer and more."
        url="/sports"
      />
      <Col className="mx-auto w-full max-w-6xl gap-3 px-2 pt-3 sm:px-4">
        <Row className="items-end justify-between gap-2 px-1">
          <Col className="gap-0.5">
            <h1 className="text-ink-1000 text-2xl font-bold tracking-tight">
              Sports
            </h1>
            <p className="text-ink-500 text-sm">
              Pick a sport and see what's on this week: games, lines, props and
              side-bets, in game order.
            </p>
          </Col>
          <Link
            href="/create"
            className="bg-primary-600 hover:bg-primary-700 text-ink-0 hidden shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium sm:flex"
          >
            <PlusIcon className="h-4 w-4" /> Create market
          </Link>
        </Row>

        <div className="bg-canvas-0 border-ink-100 sticky top-0 z-20 -mx-2 border-b px-2 sm:-mx-4 sm:px-4">
          <SportRail
            sports={sports}
            selected={selected}
            onSelect={setSelected}
            counts={schedule?.counts ?? {}}
            liveCount={schedule?.liveCount ?? 0}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Col className="min-w-0 gap-5">
            <ScheduleList
              games={games}
              loading={loading || !schedule}
              showLeague={selected === 'all' || selected === 'live'}
              liveOnly={selected === 'live'}
            />
            {selected !== 'live' && (
              <UpcomingMarkets
                refs={upcoming}
                sport={scheduleSport}
                showSport={selected === 'all'}
                sportsByKey={sportsByKey}
              />
            )}
            {schedule &&
              selected !== 'live' &&
              !hasGames &&
              upcoming.length === 0 && (
                <EmptyWeek
                  selected={selected}
                  label={sport?.longLabel ?? 'sports'}
                  sports={sports}
                  counts={schedule.counts}
                />
              )}
          </Col>
          {/* Right rail on desktop; stacks under the schedule on phones. */}
          {(allSports || sport) && (
            <SportsMarketSections sport={sport ?? 'all'} enabled={ready} />
          )}
        </div>

        <p className="text-ink-400 px-1 pb-2 text-[11px]">
          Times are shown in your local time zone. Game markets are created and
          resolved automatically by @ManifoldSports for connected leagues;
          anyone can add props and side-bets.
        </p>
      </Col>
    </Page>
  )
}

function EmptyWeek(props: {
  selected: SportSelection
  label: string
  sports: SportInfo[]
  counts: Partial<Record<AnySportKey, number>>
}) {
  const { selected, label, sports, counts } = props
  // Point at sports that do have something on this week.
  const others = sortBy(
    sports.filter((s) => s.key !== selected),
    (s) => -(counts[s.key] ?? 0)
  ).slice(0, 4)
  return (
    <Col className="border-ink-200 bg-canvas-0 gap-1.5 rounded-lg border px-4 py-4">
      <span className="text-ink-900 text-sm font-semibold">
        {selected === 'all'
          ? 'Nothing scheduled this week'
          : `Nothing scheduled in ${label} this week`}
      </span>
      <span className="text-ink-500 text-xs">
        Game markets appear here automatically once a league is connected.
        Trending and season-long markets are below.
      </span>
      {selected !== 'all' && (
        <Row className="mt-1 flex-wrap gap-1.5 text-xs">
          {others.map((s) => (
            <Link
              key={s.key}
              href={`/sports?sport=${s.key}`}
              className="border-ink-200 text-ink-600 hover:bg-canvas-50 rounded-full border px-2.5 py-1"
            >
              {s.emoji} {s.label}
            </Link>
          ))}
        </Row>
      )}
    </Col>
  )
}
