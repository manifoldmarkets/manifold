import { ClockIcon, FireIcon, SparklesIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import TrophyIcon from 'web/lib/icons/trophy-icon.svg'
import { groupBy, sortBy } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import {
  formatTime,
  getCountdownStringHoursMinutes,
} from 'client-common/lib/time'
import { APIResponse } from 'common/api/schema'
import {
  DIVISION_NAMES,
  getApproximateSeasonDates,
  getDemotionAndPromotionCountBySeason,
  getLeaguePath,
  getMaxDivisionBySeason,
  getSeasonCountdownEnd,
  getSeasonMonth,
  league_user_info,
  parseLeaguePath,
} from 'common/leagues'
import { toLabel } from 'common/util/adjective-animal'
import { formatMoney } from 'common/util/format'
import { DAY_MS } from 'common/util/time'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { CohortTable } from 'web/components/leagues/cohort-table'
import { LeagueFeed } from 'web/components/leagues/league-feed'
import { PrizesModal } from 'web/components/leagues/prizes-modal'
import {
  DivisionBadge,
  DIVISION_STYLES,
} from 'web/components/leagues/division-badge'
import { SEO } from 'web/components/SEO'
import { Avatar } from 'web/components/widgets/avatar'
import { Countdown } from 'web/components/widgets/countdown'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { useUser } from 'web/hooks/use-user'
import { useUsers } from 'web/hooks/use-user-supabase'
import { api } from 'web/lib/api/api'
import { getLeagueRows } from 'web/lib/supabase/leagues'

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export async function getStaticProps(props: {
  params: { leagueSlugs: string[] }
}) {
  try {
    // Extract season from URL if available
    const leagueSlugs = props.params?.leagueSlugs || []
    const seasonParam = leagueSlugs[0]
    const season =
      seasonParam && !isNaN(parseInt(seasonParam))
        ? parseInt(seasonParam)
        : undefined

    const currentSeasonInfo = await api('get-season-info', {})
    const seasonInfo = await api('get-season-info', season ? { season } : {})
    return {
      props: {
        initialSeasonInfo: seasonInfo,
        currentSeasonInfo,
      },
      revalidate: 60, // Revalidate every minute
    }
  } catch (err) {
    console.error('Error fetching season info:', err)
    return {
      props: {
        initialSeasonInfo: null,
      },
      revalidate: 60, // Retry sooner if there was an error
    }
  }
}

interface LeaguesProps {
  initialSeasonInfo: APIResponse<'get-season-info'> | null
  currentSeasonInfo: APIResponse<'get-season-info'> | null
}

export default function Leagues(props: LeaguesProps) {
  const { initialSeasonInfo, currentSeasonInfo } = props
  const user = useUser()

  const [rows, setRows] = usePersistentInMemoryState<league_user_info[]>(
    [],
    'league-rows'
  )

  const rowsBySeason = useMemo(() => groupBy(rows, 'season'), [rows])
  const seasonInfo = initialSeasonInfo ?? currentSeasonInfo
  const seasons = useMemo(() => {
    const seasons = []
    for (let i = 1; i <= (currentSeasonInfo?.season ?? 1); i++) {
      seasons.push(i)
    }
    return seasons
  }, [currentSeasonInfo?.season])

  const [season, setSeason] = useState<number>(seasonInfo?.season ?? 1)
  useEffect(() => {
    getLeagueRows(season).then((rows) => {
      setRows((currRows) =>
        currRows.filter((r) => r.season !== season).concat(rows)
      )
    })
  }, [season])

  const seasonRows = rowsBySeason[season] ?? []
  const seasonLoaded = seasonRows.length > 0

  const cohorts = groupBy(seasonRows, 'cohort')
  const cohortNames = sortBy(Object.keys(cohorts), (cohort) =>
    cohort.toLowerCase()
  )
  const divisionToCohorts = groupBy(
    cohortNames,
    (cohort) => cohorts[cohort][0].division
  )
  const divisions = sortBy(
    Object.keys(divisionToCohorts).map((division) => +division),
    (division) => division
  ).reverse()
  const defaultDivision = getMaxDivisionBySeason(season)
  const [division, setDivision] = useState<number>(defaultDivision)
  const divisionCohorts = divisionToCohorts[defaultDivision]
  const [cohort, setCohort] = useState(
    divisionCohorts ? divisionCohorts[0] : undefined
  )
  const [highlightedUserId, setHighlightedUserId] = useState<
    string | undefined
  >()
  const [prizesModalOpen, setPrizesModalOpen] = useState(false)
  const togglePrizesModal = () => {
    setPrizesModalOpen(!prizesModalOpen)
  }

  const { query, isReady, replace } = useRouter()
  const { leagueSlugs } = query as { leagueSlugs: string[] }

  const onSetSeason = (newSeason: number) => {
    const { season, division, cohort } = parseLeaguePath(
      [newSeason.toString()],
      rowsBySeason,
      seasons,
      user?.id
    )

    if (cohort) {
      replace(getLeaguePath(season, division, cohort), undefined)
    } else {
      replace(`${season}`, undefined)
    }
  }

  const onSetDivision = (division: number) => {
    const userRow = seasonRows.find(
      (row) => row.user_id === user?.id && row.division === division
    )
    const cohort = userRow ? userRow.cohort : divisionToCohorts[division][0]

    replace(getLeaguePath(season, division, cohort), undefined, {
      shallow: true,
    })
  }

  const onSetCohort = (cohort: string) => {
    replace(getLeaguePath(season, division, cohort), undefined, {
      shallow: true,
    })
  }

  useEffectCheckEquality(() => {
    if (!isReady || !seasonLoaded) return
    console.log('leagueSlugs', leagueSlugs, 'user', user?.id)

    const { season, division, cohort, highlightedUserId } = parseLeaguePath(
      leagueSlugs ?? [],
      rowsBySeason,
      seasons,
      user?.id
    )
    console.log(
      'setting league',
      season,
      division,
      cohort,
      highlightedUserId ?? ''
    )
    setSeason(season)
    setDivision(division)
    setCohort(cohort)
    setHighlightedUserId(highlightedUserId)
  }, [isReady, seasonLoaded, leagueSlugs, user?.id])

  const seasonStatus = seasonInfo?.status
  const countdownEnd = getSeasonCountdownEnd(season)
  const { approxEnd: seasonEnd } = getApproximateSeasonDates(season)
  const closingPeriod =
    seasonStatus === 'active' && seasonEnd.getTime() < Date.now() + DAY_MS
  const randomPeriodEnd = new Date(countdownEnd.getTime() + DAY_MS)

  const userRow = seasonRows.find((row) => row.user_id === user?.id)
  const userDivision = userRow?.division
  const userCohort = userRow?.cohort

  // Get cohort size for user's league card
  const userCohortRows = userRow
    ? seasonRows.filter(
        (r) => r.cohort === userRow.cohort && r.division === userRow.division
      )
    : []

  const url = cohort
    ? `/leagues/${season}/${DIVISION_NAMES[division]}/${cohort}`
    : `/leagues`

  const divisionStyle = DIVISION_STYLES[division] ?? DIVISION_STYLES[1]

  return (
    <Page trackPageView={'leagues'} hideFooter className="!bg-transparent">
      <SEO
        title="Leagues"
        description="See the top-ranking users this season in each league."
        url={url}
      />

      {/* Funky gradient backgrounds */}
      {/* Light mode - simple white/gray gradient for good contrast */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-white dark:hidden" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-slate-100/80 to-white dark:hidden" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-50 via-transparent to-transparent dark:hidden" />
      {/* Dark mode - rich purple gradients */}
      <div className="pointer-events-none fixed inset-0 -z-10 hidden bg-slate-900 dark:block" />
      <div className="pointer-events-none fixed inset-0 -z-10 hidden bg-gradient-to-br from-indigo-950/80 via-slate-900 to-purple-950/60 dark:block" />
      <div className="pointer-events-none fixed inset-0 -z-10 hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-800/20 via-transparent to-transparent dark:block" />
      <div className="pointer-events-none fixed inset-0 -z-10 hidden bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-fuchsia-900/30 via-transparent to-transparent dark:block" />

      <Col className="mx-auto w-full max-w-xl gap-4 px-2 pb-8 pt-4">
        {/* Hero Section with User Card */}
        <div
          className={clsx(
            'relative overflow-hidden rounded-2xl p-6',
            'bg-gradient-to-br from-indigo-100 via-purple-100 to-violet-100',
            'dark:from-indigo-900 dark:via-purple-900 dark:to-violet-900'
          )}
        >
          {/* Decorative elements */}
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-purple-300/30 blur-3xl dark:bg-purple-500/20" />
          <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-indigo-300/30 blur-2xl dark:bg-indigo-500/20" />
          <SparklesIcon className="absolute right-4 top-4 h-6 w-6 text-yellow-500/60 dark:text-yellow-400/60" />

          <Row className="relative z-10 items-center justify-between gap-4">
            <Col className="gap-2">
              <Row className="items-center gap-3">
                <TrophyIcon className="h-8 w-8 text-yellow-500 dark:text-yellow-400" />
                <h1 className="text-3xl font-black text-purple-900 dark:text-white">
                  Leagues
                </h1>
              </Row>
              <p className="max-w-xs text-sm text-purple-700 dark:text-purple-200">
                Compete for prizes based on your monthly trading profit!
              </p>
            </Col>

            {/* Season Selector */}
            <Col className="items-end gap-2">
              <select
                className={clsx(
                  'rounded-xl border-2 border-purple-400/50 px-4 py-2',
                  'bg-purple-200/50 dark:bg-purple-900/50',
                  'text-sm font-semibold text-purple-900 dark:text-white',
                  'focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-400/50 dark:focus:border-purple-300'
                )}
                value={season}
                onChange={(e) => onSetSeason(+e.target.value)}
              >
                {seasons.map((s) => (
                  <option
                    key={s}
                    value={s}
                    className="bg-purple-100 dark:bg-purple-900"
                  >
                    Season {s}: {getSeasonMonth(s)}
                  </option>
                ))}
              </select>
            </Col>
          </Row>

          {/* Season Timer */}
          <Row className="relative z-10 mt-4 items-center justify-center gap-2 rounded-xl bg-purple-200/50 px-4 py-3 backdrop-blur dark:bg-black/30">
            {closingPeriod ? (
              <>
                <FireIcon className="h-5 w-5 animate-pulse text-orange-500 dark:text-orange-400" />
                <span className="text-sm text-orange-700 dark:text-orange-200">
                  Finals! Ends randomly within{' '}
                  <span className="font-bold text-orange-600 dark:text-orange-300">
                    {getCountdownStringHoursMinutes(randomPeriodEnd)}
                  </span>
                </span>
              </>
            ) : seasonStatus === 'complete' ? (
              <>
                <ClockIcon className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                <span className="text-sm text-purple-700 dark:text-purple-200">
                  Season ended {formatTime(seasonEnd)}
                </span>
              </>
            ) : (
              <>
                <ClockIcon className="h-5 w-5 text-purple-600 dark:text-purple-300" />
                <span className="text-sm text-purple-700 dark:text-purple-200">
                  Season ends in:
                </span>
                <InfoTooltip
                  text={
                    'Once the countdown is reached the leaderboards will freeze at a random time in the following 24h to determine final ranks.'
                  }
                >
                  <Countdown
                    className="font-mono text-sm font-bold text-purple-900 dark:text-white"
                    endDate={countdownEnd}
                  />
                </InfoTooltip>
              </>
            )}
          </Row>

          {/* User's League Status (if they're in a league) */}
          {userRow && user && seasonLoaded && (
            <UserLeagueStatusInline
              userRow={userRow}
              userId={user.id}
              season={season}
              cohortSize={userCohortRows.length}
            />
          )}
        </div>

        {/* Quick Actions */}
        <Row className="gap-2">
          <button
            onClick={togglePrizesModal}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3',
              'bg-gradient-to-r from-yellow-500 to-amber-500',
              'font-semibold text-black transition-all hover:from-yellow-400 hover:to-amber-400',
              'shadow-lg shadow-amber-500/25'
            )}
          >
            <TrophyIcon className="h-5 w-5" />
            View Prizes
          </button>
          <Link
            href="/leaderboards"
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3',
              'bg-canvas-50 border-ink-200 border',
              'text-ink-700 hover:bg-canvas-100 font-semibold transition-all'
            )}
          >
            All-time Leaderboard
          </Link>
        </Row>

        <PrizesModal open={prizesModalOpen} setOpen={setPrizesModalOpen} />

        {/* Division & Cohort Selection */}
        {cohort && seasonLoaded && (
          <Col className="gap-3">
            {/* Division Pills */}
            <Row className="scrollbar-hide -mx-2 gap-2 overflow-x-auto px-2 pb-1">
              {divisions.map((div) => {
                const isSelected = div === division
                const isUserDivision = div === userDivision
                const style = DIVISION_STYLES[div] ?? DIVISION_STYLES[1]
                return (
                  <button
                    key={div}
                    onClick={() => onSetDivision(div)}
                    className={clsx(
                      'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 transition-all',
                      'border-2',
                      isSelected
                        ? `${style.bg} ${style.border} ${style.text} shadow-lg ${style.glow}`
                        : 'border-ink-200 hover:border-ink-300 bg-canvas-0 text-ink-600'
                    )}
                  >
                    <span className="text-lg">{style.icon}</span>
                    <span className="font-medium">{DIVISION_NAMES[div]}</span>
                    {isUserDivision && (
                      <span className="bg-primary-500 rounded px-1.5 py-0.5 text-xs font-bold text-white">
                        YOU
                      </span>
                    )}
                  </button>
                )
              })}
            </Row>

            {/* Cohort Selector */}
            <Row className="items-center gap-2">
              <span className="text-ink-500 text-sm">Group:</span>
              <select
                className={clsx(
                  'bg-canvas-0 rounded-lg border-2 px-3 py-1.5',
                  'text-sm font-medium',
                  'focus:ring-primary-500/50 focus:outline-none focus:ring-2',
                  divisionStyle.border,
                  divisionStyle.text
                )}
                value={cohort}
                onChange={(e) => onSetCohort(e.target.value)}
              >
                {divisionToCohorts[division]?.map((c) => (
                  <option key={c} value={c}>
                    {c === userCohort ? '★ ' : ''}
                    {toLabel(c)}
                  </option>
                ))}
              </select>
            </Row>
          </Col>
        )}

        {/* Rankings / Activity Tabs */}
        {seasonLoaded && cohort ? (
          <LeaguesInnerPage
            seasonRows={seasonRows}
            season={season}
            division={division}
            cohort={cohort}
            highlightedUserId={highlightedUserId}
          />
        ) : (
          <LoadingIndicator />
        )}
      </Col>
    </Page>
  )
}

// Inline user status component for the hero section
function UserLeagueStatusInline(props: {
  userRow: league_user_info
  userId: string
  season: number
  cohortSize: number
}) {
  const { userRow, userId, season, cohortSize } = props
  const users = useUsers([userId])
  const userData = users?.[0]

  if (!userData) return null

  const { division, cohort, rank, mana_earned } = userRow
  const style = DIVISION_STYLES[division] ?? DIVISION_STYLES[1]

  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCountBySeason(season, division, cohortSize)

  // Calculate zone
  const getZone = () => {
    if (rank <= doublePromotion)
      return {
        type: 'double-promote',
        label: 'Double Promote!',
        color: 'text-emerald-600 dark:text-emerald-300',
      }
    if (rank <= promotion)
      return {
        type: 'promote',
        label: 'Promotion Zone!',
        color: 'text-teal-600 dark:text-teal-300',
      }
    if (rank > cohortSize - demotion)
      return {
        type: 'demote',
        label: 'Demotion Zone',
        color: 'text-rose-600 dark:text-rose-300',
      }
    return {
      type: 'safe',
      label: 'Safe Zone',
      color: 'text-purple-600 dark:text-purple-200',
    }
  }

  const zone = getZone()
  const progressPercent = Math.max(
    0,
    ((cohortSize - rank + 1) / cohortSize) * 100
  )

  // Calculate distance to next zone
  const getNextZoneInfo = () => {
    if (zone.type === 'double-promote') return null
    if (zone.type === 'promote') {
      const ranksToDoublePromo = rank - doublePromotion
      return `${ranksToDoublePromo} to double promo`
    }
    if (zone.type === 'safe') {
      const ranksToPromo = rank - promotion
      return `${ranksToPromo} to promotion`
    }
    const ranksToDemote = cohortSize - demotion + 1 - rank
    return `${ranksToDemote} until safe`
  }

  const nextZoneInfo = getNextZoneInfo()

  return (
    <div className="relative z-10 mt-5 rounded-xl bg-purple-100 p-4 backdrop-blur-sm dark:bg-black/20">
      <Row className="items-center gap-4">
        {/* Division badge */}
        <DivisionBadge division={division} size="lg" showName={false} glow />

        {/* User info */}
        <Col className="flex-1 gap-0.5">
          <Row className="items-center gap-2">
            <Avatar
              avatarUrl={userData.avatarUrl ?? ''}
              username={userData.username}
              size="xs"
              noLink
            />
            <Link
              href={`/${userData.username}`}
              className="font-semibold text-purple-900 hover:underline dark:text-white"
            >
              {userData.name}
            </Link>
          </Row>
          <span className="text-xs text-purple-600 dark:text-purple-300">
            {DIVISION_NAMES[division]} • {toLabel(cohort)}
          </span>
        </Col>

        {/* Rank and earnings */}
        <Col className="items-end">
          <span className="text-2xl font-black text-purple-900 dark:text-white">
            #{rank}
          </span>
          <span className="text-sm font-medium text-cyan-600 dark:text-cyan-400">
            {formatMoney(mana_earned)} earned
          </span>
        </Col>
      </Row>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-purple-300 dark:bg-white/20">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              `bg-gradient-to-r ${style.gradient}`
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <Row className="mt-1.5 items-center justify-between text-xs">
          <span className={zone.color}>{zone.label}</span>
          {nextZoneInfo && (
            <span className="text-purple-600 dark:text-purple-300">
              {nextZoneInfo}
            </span>
          )}
        </Row>
      </div>
    </div>
  )
}

function LeaguesInnerPage(props: {
  seasonRows: league_user_info[]
  season: number
  division: number
  cohort: string
  highlightedUserId: string | undefined
}) {
  const { seasonRows, season, division, cohort, highlightedUserId } = props
  const cohorts = groupBy(seasonRows, 'cohort')
  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCountBySeason(
      season,
      division,
      cohorts[cohort]?.length ?? 0
    )

  return (
    <>
      <QueryUncontrolledTabs
        trackingName="league tabs"
        labelClassName={'!pb-3 !pt-0'}
        key={`${season}-${division}-${cohort}`}
        tabs={[
          {
            title: 'Rankings',
            content: cohorts[cohort] && (
              <CohortTable
                season={season}
                cohort={cohort}
                rows={cohorts[cohort]}
                highlightedUserId={highlightedUserId}
                demotionCount={demotion}
                promotionCount={promotion}
                doublePromotionCount={doublePromotion}
              />
            ),
          },
          {
            title: 'Activity',
            content: <LeagueFeed season={season} cohort={cohort} />,
          },
        ]}
      />
    </>
  )
}
