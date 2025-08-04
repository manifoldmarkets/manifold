import { ClockIcon } from '@heroicons/react/outline'
import { groupBy, sortBy } from 'lodash'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'

import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import {
  formatTime,
  getCountdownStringHoursMinutes,
} from 'client-common/lib/time'
import { APIResponse } from 'common/api/schema'
import {
  DIVISION_NAMES,
  getDemotionAndPromotionCountBySeason,
  getLeaguePath,
  getMaxDivisionBySeason,
  getSeasonCountdownEnd,
  getSeasonDates,
  getSeasonMonth,
  league_user_info,
  parseLeaguePath,
} from 'common/leagues'
import { toLabel } from 'common/util/adjective-animal'
import { DAY_MS } from 'common/util/time'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { CohortTable } from 'web/components/leagues/cohort-table'
import { LeagueFeed } from 'web/components/leagues/league-feed'
import { PrizesModal } from 'web/components/leagues/prizes-modal'
import { SEO } from 'web/components/SEO'
import { Countdown } from 'web/components/widgets/countdown'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Select } from 'web/components/widgets/select'
import { Title } from 'web/components/widgets/title'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { useUser } from 'web/hooks/use-user'
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

  const MARKER = '★'
  const seasonStatus = seasonInfo?.status
  const countdownEnd = getSeasonCountdownEnd(season)
  const { approxEnd: seasonEnd } = getSeasonDates(season)
  const closingPeriod =
    seasonStatus === 'active' && seasonEnd.getTime() < Date.now() + DAY_MS
  const randomPeriodEnd = new Date(countdownEnd.getTime() + DAY_MS)

  const userRow = seasonRows.find((row) => row.user_id === user?.id)
  const userDivision = userRow?.division
  const userCohort = userRow?.cohort

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

      <Col className="mx-auto w-full max-w-xl gap-2 px-1 pt-4">
        <Col className="px-2">
          <Row className="mb-2 items-center justify-between gap-4">
            <Title className="!mb-0">Leagues</Title>
            <Select
              className="!border-ink-200 !h-10"
              value={season}
              onChange={(e) => onSetSeason(+e.target.value)}
            >
              {seasons.map((season) => (
                <option key={season} value={season}>
                  Season {season}: {getSeasonMonth(season)}
                </option>
              ))}
            </Select>
          </Row>
          <Col className="text-ink-700 my-2 justify-center gap-1">
            <div>
              Win{' '}
              <span
                className="border-primary-600 text-primary-600 hover:text-primary-800 cursor-help border-b border-dotted"
                onClick={togglePrizesModal}
              >
                prizes
              </span>{' '}
              for the most profit (realized and unrealized) on trades placed
              this month!
              <span className={'ml-1'}>
                {closingPeriod && (
                  <>
                    Ends randomly within <br />
                    <ClockIcon className="text-ink-1000 inline h-4 w-4" />{' '}
                    {getCountdownStringHoursMinutes(randomPeriodEnd)}
                  </>
                )}
                {seasonStatus === 'complete' && (
                  <>Ended {formatTime(seasonEnd)}</>
                )}
                {seasonStatus === 'active' && (
                  <>
                    Season ends in:{' '}
                    <InfoTooltip
                      text={
                        'Once the countdown is reached the leaderboards will freeze at a random time in the following 24h to determine final ranks.'
                      }
                    >
                      <Countdown className=" text-sm" endDate={countdownEnd} />
                    </InfoTooltip>
                  </>
                )}
              </span>
            </div>
            <div>
              All-time leaderboard is{' '}
              <Link
                href="/leaderboards"
                className="text-primary-600 hover:text-primary-800 underline-offset-2 hover:underline"
              >
                here
              </Link>
              .
            </div>
          </Col>

          <PrizesModal open={prizesModalOpen} setOpen={setPrizesModalOpen} />

          {cohort && (
            <Row className="mt-2 gap-2">
              <Select
                className="!border-ink-200"
                value={division}
                onChange={(e) => onSetDivision(+e.target.value)}
              >
                {divisions.map((division) => (
                  <option key={division} value={division}>
                    {division === userDivision ? MARKER : ''}{' '}
                    {DIVISION_NAMES[division]}
                  </option>
                ))}
              </Select>

              <Select
                className="!border-ink-200"
                value={cohort}
                onChange={(e) => onSetCohort(e.target.value)}
              >
                {divisionToCohorts[division]?.map((cohort) => (
                  <option key={cohort} value={cohort}>
                    {cohort === userCohort ? MARKER : ''} {toLabel(cohort)}
                  </option>
                ))}
              </Select>
            </Row>
          )}
        </Col>

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
    getDemotionAndPromotionCountBySeason(season, division)

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
