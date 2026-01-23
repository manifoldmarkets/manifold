import { ClockIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
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
      revalidate: 60,
    }
  } catch (err) {
    console.error('Error fetching season info:', err)
    return {
      props: {
        initialSeasonInfo: null,
      },
      revalidate: 60,
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
  const divisionIcons: { [key: number]: string } = {
    0: '🤖',
    1: '🥉',
    2: '🥈',
    3: '🥇',
    4: '💿',
    5: '💎',
    6: '🎖️',
  }
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

    const { season, division, cohort, highlightedUserId } = parseLeaguePath(
      leagueSlugs ?? [],
      rowsBySeason,
      seasons,
      user?.id
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

  const userCohortRows = userRow
    ? seasonRows.filter(
        (r) => r.cohort === userRow.cohort && r.division === userRow.division
      )
    : []

  const url = cohort
    ? `/leagues/${season}/${DIVISION_NAMES[division]}/${cohort}`
    : `/leagues`

  return (
    <Page trackPageView={'leagues'}>
      <SEO
        title="Leagues"
        description="See the top-ranking users this season in each league."
        url={url}
      />

      <Col className="mx-auto w-full max-w-2xl gap-6 px-4 pb-8 pt-4">
        {/* Header */}
        <Col className="gap-1">
          <Row className="items-center justify-between">
            <h1 className="text-primary-700 text-2xl font-semibold">Leagues</h1>
            <Link
              href="/leaderboards"
              className="text-ink-500 hover:text-ink-700 text-sm"
            >
              All-time leaderboard →
            </Link>
          </Row>
          <p className="text-ink-500 text-sm">
            Compete monthly for prizes based on your trading profit.
          </p>
        </Col>

        {/* Season Status Bar */}
        <div className="border-ink-200 rounded-lg border px-4 py-3">
          <Row className="flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <select
              className="bg-canvas-0 border-ink-200 text-ink-600 focus:border-primary-500 focus:ring-primary-500 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1"
              value={season}
              onChange={(e) => onSetSeason(+e.target.value)}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  Season {s}: {getSeasonMonth(s)}
                </option>
              ))}
            </select>
            <Row className="items-center gap-2">
              <ClockIcon className="text-ink-400 h-4 w-4" />
              {closingPeriod ? (
                <span className="text-ink-600 text-sm">
                  Finals — ends within{' '}
                  <span className="font-medium">
                    {getCountdownStringHoursMinutes(randomPeriodEnd)}
                  </span>
                </span>
              ) : seasonStatus === 'complete' ? (
                <span className="text-ink-600 text-sm">
                  Ended {formatTime(seasonEnd)}
                </span>
              ) : (
                <span className="text-ink-600 text-sm">
                  Ends in{' '}
                  <InfoTooltip text="Once the countdown ends, leaderboards freeze at a random time in the following 24h.">
                    <Countdown
                      className="font-mono text-sm font-medium"
                      endDate={countdownEnd}
                    />
                  </InfoTooltip>
                </span>
              )}
            </Row>
            <button
              onClick={() => setPrizesModalOpen(true)}
              className="text-ink-500 hover:text-ink-700 text-sm"
            >
              🏆 View prizes
            </button>
          </Row>
        </div>

        <PrizesModal open={prizesModalOpen} setOpen={setPrizesModalOpen} />

        {/* User's Current Status */}
        {userRow && user && seasonLoaded && (
          <UserLeagueStatus
            userRow={userRow}
            userId={user.id}
            season={season}
            cohortSize={userCohortRows.length}
          />
        )}

        {/* Division & Cohort Selection */}
        {cohort && seasonLoaded && (
          <Col className="gap-4">
            {/* Division Tabs */}
            <div className="border-ink-200 border-b">
              <Row className="scrollbar-hide -mb-px gap-1 overflow-x-auto">
                {divisions.map((div) => {
                  const isSelected = div === division
                  const isUserDivision = div === userDivision
                  return (
                    <button
                      key={div}
                      onClick={() => onSetDivision(div)}
                      className={clsx(
                        'flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                        isSelected
                          ? 'border-primary-500 text-primary-600'
                          : 'text-ink-500 hover:text-ink-700 border-transparent'
                      )}
                    >
                      <span>{divisionIcons[div]}</span>
                      <span>{DIVISION_NAMES[div]}</span>
                      {isUserDivision && (
                        <span className="bg-primary-100 text-primary-700 rounded px-1.5 py-0.5 text-xs font-medium">
                          You
                        </span>
                      )}
                    </button>
                  )
                })}
              </Row>
            </div>

            {/* Cohort Selector */}
            <Row className="items-center gap-3">
              <span className="text-ink-500 text-sm">Group:</span>
              <select
                className="bg-canvas-0 border-ink-200 text-ink-700 focus:border-primary-500 focus:ring-primary-500 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
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

// Division styling for the user card
const DIVISION_CARD_STYLES: {
  [key: number]: { border: string; bg: string; text: string; icon: string }
} = {
  0: {
    border: 'border-slate-400 dark:border-slate-800',
    bg: 'bg-slate-50 dark:bg-slate-800/30',
    text: 'text-slate-600 dark:text-slate-300',
    icon: '🤖',
  },
  1: {
    border: 'border-amber-400 dark:border-amber-800',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-600 dark:text-amber-400',
    icon: '🥉',
  },
  2: {
    border: 'border-slate-400 dark:border-slate-800',
    bg: 'bg-slate-50 dark:bg-slate-800/30',
    text: 'text-slate-600 dark:text-slate-300',
    icon: '🥈',
  },
  3: {
    border: 'border-yellow-500 dark:border-yellow-800',
    bg: 'bg-yellow-50 dark:bg-yellow-950/20',
    text: 'text-yellow-600 dark:text-yellow-400',
    icon: '🥇',
  },
  4: {
    border: 'border-cyan-400 dark:border-cyan-800',
    bg: 'bg-cyan-50 dark:bg-cyan-950/20',
    text: 'text-cyan-600 dark:text-cyan-400',
    icon: '💿',
  },
  5: {
    border: 'border-violet-400 dark:border-violet-800',
    bg: 'bg-violet-50 dark:bg-violet-950/20',
    text: 'text-violet-600 dark:text-violet-400',
    icon: '💎',
  },
  6: {
    border: 'border-rose-400 dark:border-rose-800',
    bg: 'bg-rose-50 dark:bg-rose-950/20',
    text: 'text-rose-600 dark:text-rose-400',
    icon: '🎖️',
  },
}

function UserLeagueStatus(props: {
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

  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCountBySeason(season, division, cohortSize)

  const nextDivision = DIVISION_NAMES[division + 1]
  const nextNextDivision = DIVISION_NAMES[division + 2]
  const prevDivision = DIVISION_NAMES[Math.max(division - 1, 1)]
  const currentDivision = DIVISION_NAMES[division]

  const divisionStyle =
    DIVISION_CARD_STYLES[division] ?? DIVISION_CARD_STYLES[1]

  const getZone = () => {
    if (rank <= doublePromotion && nextNextDivision)
      return {
        label: `Promoting to ${nextNextDivision}`,
        color: 'text-teal-600',
      }
    if (rank <= promotion && nextDivision)
      return { label: `Promoting to ${nextDivision}`, color: 'text-teal-600' }
    if (rank > cohortSize - demotion && demotion > 0)
      return { label: `Demoting to ${prevDivision}`, color: 'text-scarlet-600' }
    return { label: `Remaining in ${currentDivision}`, color: 'text-ink-500' }
  }

  const zone = getZone()

  return (
    <div
      className={clsx(
        'rounded-lg border-l-4 p-4',
        'bg-canvas-0 border border-l-4',
        divisionStyle.border
      )}
    >
      <Row className="items-center gap-4">
        {/* Division badge */}
        <div
          className={clsx(
            'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg',
            divisionStyle.bg
          )}
        >
          <span className="text-2xl">{divisionStyle.icon}</span>
          <span className={clsx('text-xs font-semibold', divisionStyle.text)}>
            {currentDivision}
          </span>
        </div>

        {/* User info */}
        <Col className="flex-1 gap-1">
          <Row className="items-center gap-2">
            <Avatar
              avatarUrl={userData.avatarUrl ?? ''}
              username={userData.username}
              size="xs"
              noLink
              entitlements={userData.entitlements}
              displayContext="leagues"
            />
            <Link
              href={`/${userData.username}`}
              className="text-ink-900 font-medium hover:underline"
            >
              {userData.name}
            </Link>
          </Row>
          <span className="text-ink-500 text-sm">{toLabel(cohort)}</span>
        </Col>

        {/* Rank and earnings */}
        <Col className="items-end">
          <span className="text-ink-900 text-2xl font-bold">#{rank}</span>
          <span
            className={clsx(
              'text-sm font-medium',
              mana_earned > 0
                ? 'text-teal-600'
                : mana_earned < 0
                ? 'text-scarlet-500'
                : 'text-ink-500'
            )}
          >
            {mana_earned > 0 ? '+' : ''}
            {formatMoney(mana_earned)}
          </span>
        </Col>
      </Row>

      <Row className="border-ink-100 mt-3 border-t pt-3 text-sm">
        <span className={zone.color}>{zone.label}</span>
      </Row>
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
    <QueryUncontrolledTabs
      trackingName="league tabs"
      labelClassName="!pb-3 !pt-0"
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
  )
}
