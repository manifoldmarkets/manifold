import { PlusIcon } from '@heroicons/react/solid'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo } from 'react'
import {
  SPORT_BY_KEY,
  SPORT_CATEGORIES,
  SportKey,
} from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { ScheduleList } from 'web/components/sports/schedule-list'
import { SportRail, SportSelection } from 'web/components/sports/sport-rail'
import { SportsMarketSections } from 'web/components/sports/sports-market-sections'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useSportsSchedule } from 'web/hooks/use-sports-schedule'
import { useUser } from 'web/hooks/use-user'

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

const isSportSelection = (s: unknown): s is SportSelection =>
  s === 'all' ||
  s === 'live' ||
  (typeof s === 'string' &&
    Object.prototype.hasOwnProperty.call(SPORT_BY_KEY, s))

export default function SportsPage() {
  const user = useUser()
  useSaveReferral(user)
  useSaveScroll('sports', true)
  const router = useRouter()

  const [savedSport, setSavedSport] = usePersistentLocalState<SportSelection>(
    'all',
    'sports-page-sport'
  )

  const querySport = useMemo((): SportSelection | undefined => {
    if (!router.isReady) return undefined
    const raw = router.query.sport ?? router.query.tab
    const value = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase()
    if (!value) return undefined
    if (isSportSelection(value)) return value
    return LEGACY_TAB_TO_SPORT[value]
  }, [router.isReady, router.query.sport, router.query.tab])

  // Stored values are user data: validate before trusting them.
  const restored: SportSelection = isSportSelection(savedSport)
    ? savedSport
    : 'all'
  const requested: SportSelection = querySport ?? restored
  useEffect(() => {
    if (querySport && querySport !== savedSport) setSavedSport(querySport)
  }, [querySport])
  // A sport restored from storage shows up in the address bar too, so the
  // page and the URL never disagree.
  useEffect(() => {
    if (!router.isReady || querySport || restored === 'all') return
    router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, sport: restored },
      },
      undefined,
      { shallow: true }
    )
  }, [router.isReady])

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

  const scheduleSport: SportKey | 'all' =
    requested === 'live' ? 'all' : requested
  // Don't fetch until the router has told us which sport the URL asks for.
  const { schedule, loading } = useSportsSchedule(scheduleSport, router.isReady)
  // If nothing is live any more, the Live chip is gone: fall back to All.
  const selected: SportSelection =
    requested === 'live' && schedule && schedule.liveCount === 0
      ? 'all'
      : requested
  const games = schedule?.games ?? []
  const sport =
    selected === 'all' || selected === 'live'
      ? undefined
      : SPORT_BY_KEY[selected]

  return (
    <Page trackPageView="/sports" className="!col-span-10">
      <SEO
        title="Sports"
        description="Bet on every game: live odds, upcoming schedules, props and futures across NFL, NBA, MLB, NHL, soccer and more."
        url="/sports"
      />
      <Col className="mx-auto w-full max-w-6xl gap-3 px-2 pt-3 sm:px-4">
        <Row className="items-end justify-between gap-2 px-1">
          <Col className="gap-0.5">
            <h1 className="text-ink-1000 text-2xl font-bold tracking-tight">
              Sports
            </h1>
            <p className="text-ink-500 text-sm">
              Pick a sport, find the game, bet the line — then expand any game
              for props and side-bets.
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
            selected={selected}
            onSelect={setSelected}
            counts={schedule?.counts ?? {}}
            liveCount={schedule?.liveCount ?? 0}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Col className="min-w-0 gap-4">
            <ScheduleList
              games={games}
              loading={loading || !schedule}
              showLeague={selected === 'all' || selected === 'live'}
              liveOnly={selected === 'live'}
              emptyState={
                <EmptySchedule
                  selected={selected}
                  label={sport?.longLabel ?? 'sports'}
                />
              }
            />
          </Col>
          {/* Right rail on desktop; stacks under the schedule on phones. */}
          <SportsMarketSections sport={scheduleSport} />
        </div>

        <p className="text-ink-400 px-1 pb-2 text-[11px]">
          Times are shown in your local time zone. Game markets are created and
          resolved automatically by @ManifoldSports; anyone can add props and
          side-bets.
        </p>
      </Col>
    </Page>
  )
}

function EmptySchedule(props: { selected: SportSelection; label: string }) {
  const { selected, label } = props
  const others = SPORT_CATEGORIES.filter((s) => s.key !== selected).slice(0, 4)
  return (
    <Col className="border-ink-200 bg-canvas-0 items-center gap-2 rounded-lg border px-4 py-10 text-center">
      <span className="text-3xl">
        {selected === 'live'
          ? '⏱️'
          : selected === 'all'
          ? '🏟️'
          : SPORT_BY_KEY[selected]?.emoji}
      </span>
      <span className="text-ink-900 text-sm font-semibold">
        {selected === 'live'
          ? 'Nothing is live right now'
          : `No scheduled ${label} games in the next two weeks`}
      </span>
      <span className="text-ink-500 max-w-sm text-xs">
        {selected === 'live'
          ? 'Games move here at kickoff. Until then, check what’s up next.'
          : 'Game markets appear here automatically a few days before kickoff. In the meantime, trade the trending and season-long markets below.'}
      </span>
      {selected !== 'all' && (
        <Row className="mt-2 flex-wrap justify-center gap-1.5 text-xs">
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
