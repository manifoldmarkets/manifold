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
            <select
              className="bg-canvas-0 border-ink-200 text-ink-700 rounded-lg border px-3 py-1.5 text-sm font-medium focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              value={season}
              onChange={(e) => onSetSeason(+e.target.value)}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  Season {s}: {getSeasonMonth(s)}
                </option>
              ))}
            </select>
          </Row>
          <p className="text-ink-500 text-sm">
            Compete monthly for prizes based on your trading profit.
          </p>
        </Col>

        {/* Season Status Bar */}
        <div className="bg-canvas-50 border-ink-200 rounded-lg border px-4 py-3">
          <Row className="items-center justify-between gap-4">
            <Row className="items-center gap-2">
              <ClockIcon className="text-ink-400 h-4 w-4" />
              {closingPeriod ? (
                <span className="text-ink-600 text-sm">
                  Finals period — ends randomly within{' '}
                  <span className="font-medium">
                    {getCountdownStringHoursMinutes(randomPeriodEnd)}
                  </span>
                </span>
              ) : seasonStatus === 'complete' ? (
                <span className="text-ink-600 text-sm">
                  Season ended {formatTime(seasonEnd)}
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
            <Row className="items-center gap-2">
              <button
                onClick={() => setPrizesModalOpen(true)}
                className="text-ink-500 hover:text-ink-700 text-sm"
              >
                View prizes
              </button>
              <span className="text-ink-300">·</span>
              <Link
                href="/leaderboards"
                className="text-ink-500 hover:text-ink-700 text-sm"
              >
                All-time leaderboard
              </Link>
            </Row>
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
                className="bg-canvas-0 border-ink-200 text-ink-700 rounded-md border px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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

  const getZone = () => {
    if (rank <= doublePromotion && nextNextDivision)
      return { label: `Promoting to ${nextNextDivision}`, color: 'text-teal-600' }
    if (rank <= promotion && nextDivision)
      return { label: `Promoting to ${nextDivision}`, color: 'text-teal-600' }
    if (rank > cohortSize - demotion && demotion > 0)
      return { label: `Demoting to ${prevDivision}`, color: 'text-scarlet-600' }
    return { label: `Remaining in ${currentDivision}`, color: 'text-ink-500' }
  }

  const zone = getZone()

  return (
    <div className="bg-canvas-0 border-ink-200 rounded-lg border p-4">
      <Row className="items-center gap-3">
        <Avatar
          avatarUrl={userData.avatarUrl ?? ''}
          username={userData.username}
          size="sm"
          noLink
        />

        <Col className="flex-1 gap-0.5">
          <Link
            href={`/${userData.username}`}
            className="text-ink-900 font-medium hover:underline"
          >
            {userData.name}
          </Link>
          <span className="text-ink-500 text-sm">
            {DIVISION_NAMES[division]} · {toLabel(cohort)}
          </span>
        </Col>

        <Col className="items-end gap-0.5">
          <span className="text-ink-900 text-xl font-semibold">#{rank}</span>
          <span className="text-teal-600 text-sm font-medium">
            {formatMoney(mana_earned)}
          </span>
        </Col>
      </Row>

      <Row className="mt-3 border-t border-ink-100 pt-3 text-sm">
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
