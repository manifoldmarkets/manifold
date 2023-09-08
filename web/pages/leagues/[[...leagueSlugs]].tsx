import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react'
import { groupBy, sortBy } from 'lodash'
import { ChatIcon, ClockIcon } from '@heroicons/react/outline'
import { useRouter } from 'next/router'

import {
  DIVISION_NAMES,
  CURRENT_SEASON,
  getLeaguePath,
  league_user_info,
  parseLeaguePath,
  getSeasonStatus,
  SEASONS,
  getSeasonMonth,
  season,
  getSeasonCountdownEnd,
  getSeasonDates,
  getMaxDivisionBySeason,
  getDemotionAndPromotionCountBySeason,
} from 'common/leagues'
import { toLabel } from 'common/util/adjective-animal'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getLeagueRows } from 'web/lib/supabase/leagues'
import { CohortTable } from 'web/components/leagues/cohort-table'
import { PrizesModal } from 'web/components/leagues/prizes-modal'
import { LeagueFeed } from 'web/components/leagues/league-feed'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { SEO } from 'web/components/SEO'
import { LeagueChat } from 'web/components/groups/league-chat'
import {
  getLeagueChatChannelId,
  getSeasonDivisionCohort,
} from 'common/league-chat'
import { useAllUnseenChatsForLeages } from 'web/hooks/use-chats'
import { Countdown } from 'web/components/widgets/countdown'
import { formatTime, getCountdownStringHoursMinutes } from 'web/lib/util/time'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export async function getStaticProps() {
  const rows = await getLeagueRows(CURRENT_SEASON)
  return {
    props: {
      rows,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export default function Leagues(props: { rows: league_user_info[] }) {
  const user = useUser()

  const [rows, setRows] = usePersistentInMemoryState<league_user_info[]>(
    props.rows,
    'league-rows'
  )

  const rowsBySeason = useMemo(() => groupBy(rows, 'season'), [rows])

  const [season, setSeason] = useState<number>(CURRENT_SEASON)
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
      user?.id
    )

    if (cohort) {
      replace(getLeaguePath(season, division, cohort), undefined, {
        shallow: true,
      })
    } else {
      replace(`${season}`, undefined, { shallow: true })
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

  useEffect(() => {
    if (!isReady || !seasonLoaded) return
    console.log('leagueSlugs', leagueSlugs, 'user', user?.id)

    const { season, division, cohort, highlightedUserId } = parseLeaguePath(
      leagueSlugs ?? [],
      rowsBySeason,
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
  const seasonStatus = getSeasonStatus(season)
  const countdownEnd = getSeasonCountdownEnd(season)
  const { end: seasonEnd } = getSeasonDates(season)
  const randomPeriodEnd = new Date(countdownEnd.getTime() + 24 * 60 * 60 * 1000)

  const userRow = seasonRows.find((row) => row.user_id === user?.id)
  const userDivision = userRow?.division
  const userCohort = userRow?.cohort

  const [unseenLeagueChats, setUnseenLeagueChats] = useAllUnseenChatsForLeages(
    user?.id,
    [],
    {
      season,
      division,
      cohort: cohort ?? '--',
    }
  )
  const unseenCohortChats = unseenLeagueChats.map(
    (c) => getSeasonDivisionCohort(c).cohort
  )

  const showNotif = (cohort: string) =>
    query.tab !== 'chat' && unseenCohortChats.includes(cohort)

  return (
    <Page trackPageView={'leagues'}>
      <SEO
        title="Leagues"
        description="See the top-ranking users this season in each league."
        url="/leagues"
      />

      <Col className="mx-auto w-full max-w-lg gap-2 pt-2 sm:pt-0">
        <Col className="px-2 sm:mt-2 sm:px-0">
          <Row className="mb-2 items-center gap-4">
            <Title className="!mb-0 hidden sm:block">Leagues</Title>
            <Col className="items-center gap-1">
              <Select
                className="!border-ink-200 !h-10"
                value={season}
                onChange={(e) => onSetSeason(+e.target.value as season)}
              >
                {SEASONS.map((season) => (
                  <option key={season} value={season}>
                    Season {season}: {getSeasonMonth(season)}
                  </option>
                ))}
              </Select>
            </Col>
            <Col className="items-center gap-1">
              <Row className="gap-1.5">
                <div className={'text-sm'}>
                  {seasonStatus === 'closing-period' && (
                    <>
                      Ends randomly within <br />
                      <ClockIcon className="text-ink-1000 inline h-4 w-4" />{' '}
                      {getCountdownStringHoursMinutes(randomPeriodEnd)}
                    </>
                  )}
                  {seasonStatus === 'ended' && (
                    <>Ended {formatTime(seasonEnd)}</>
                  )}
                  {seasonStatus === 'current' && (
                    <>
                      Countdown:{' '}
                      <InfoTooltip
                        text={
                          'Once the countdown is reached the leaderboards will freeze at a random time in the following 24h to determine final ranks.'
                        }
                      >
                        <Countdown
                          className=" text-sm"
                          endDate={countdownEnd}
                        />
                      </InfoTooltip>
                    </>
                  )}
                </div>
              </Row>
            </Col>
          </Row>

          <Row className="mb-2 mt-2 items-center gap-3">
            <text className="">
              Compete against similar users for{' '}
              <span
                className="cursor-pointer border-b border-dotted border-blue-600 text-blue-600 hover:text-blue-800"
                onClick={togglePrizesModal}
              >
                prizes
              </span>{' '}
              and promotion by earning the most mana this month!
            </text>
            <PrizesModal open={prizesModalOpen} setOpen={setPrizesModalOpen} />
          </Row>

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
                    {unseenLeagueChats
                      .map((c) => getSeasonDivisionCohort(c).division)
                      .includes(division) &&
                      query.tab != 'chat' &&
                      '🔵'}{' '}
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
                    {showNotif(cohort) && '🔵'}{' '}
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
            setUnseenLeagueChats={setUnseenLeagueChats}
            showNotif={showNotif(cohort)}
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
  setUnseenLeagueChats: Dispatch<SetStateAction<string[]>>
  showNotif: boolean
}) {
  const {
    seasonRows,
    season,
    division,
    cohort,
    highlightedUserId,
    setUnseenLeagueChats,
    showNotif,
  } = props
  const cohorts = groupBy(seasonRows, 'cohort')

  const user = useUser()

  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCountBySeason(season, division)

  const leagueChannelId = getLeagueChatChannelId(season, division, cohort)

  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div className={'h-0'} ref={setContainerRef} />
      <QueryUncontrolledTabs
        labelClassName={'!pb-3 !pt-0'}
        onClick={(tab) => {
          if (tab === 'Chat') {
            setUnseenLeagueChats((unseenLeagueChats) =>
              unseenLeagueChats.filter(
                (c) => c != getLeagueChatChannelId(season, division, cohort)
              )
            )
          }
        }}
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
          {
            title: 'Chat',
            inlineTabIcon: showNotif && (
              <ChatIcon className="h-5 w-5 text-blue-600" />
            ),
            content: (
              <LeagueChat
                user={user}
                channelId={leagueChannelId}
                offsetTop={(containerRef?.offsetTop ?? 0) + 47}
              />
            ),
          },
        ]}
      />
    </>
  )
}
