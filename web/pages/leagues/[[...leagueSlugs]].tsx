import { useEffect, useMemo, useState } from 'react'
import { groupBy, sortBy } from 'lodash'
import { ChatIcon, ClockIcon } from '@heroicons/react/outline'
import { useRouter } from 'next/router'

import {
  DIVISION_NAMES,
  getDemotionAndPromotionCount,
  CURRENT_SEASON,
  getLeaguePath,
  league_user_info,
  getSeasonDates,
  parseLeaguePath,
  getSeasonStatus,
  MIN_LEAGUE_BID,
  MIN_BID_INCREASE_FACTOR,
  IS_BIDDING_PERIOD,
  SEASONS,
  getSeasonMonth,
  season,
} from 'common/leagues'
import { toLabel } from 'common/util/adjective-animal'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { useTracking } from 'web/hooks/use-tracking'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getLeagueRows } from 'web/lib/supabase/leagues'
import { CohortTable } from 'web/components/leagues/cohort-table'
import { PrizesModal } from 'web/components/leagues/prizes-modal'
import { LeagueFeed } from 'web/components/leagues/league-feed'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { SEO } from 'web/components/SEO'
import { UserLink } from 'web/components/widgets/user-link'
import { Avatar } from 'web/components/widgets/avatar'
import { LeagueBidPanel } from 'web/components/leagues/league-bid-panel'
import { useLeagueBid } from 'web/hooks/use-league-bid-txn'
import { useUserById } from 'web/hooks/use-user-supabase'
import { LeagueChat } from 'web/components/groups/league-chat'
import {
  getLeagueChatChannelId,
  getSeasonDivisionCohort,
} from 'common/league-chat'
import { useAllUnseenChatsForLeages } from 'web/hooks/use-chats'
import { useOwnedLeagueChats } from 'web/hooks/use-leagues'
import { Countdown } from 'web/components/widgets/countdown'
import { formatTime } from 'web/lib/util/time'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'

export async function getStaticProps() {
  const rows = await getLeagueRows()
  const currentSeasonRows = rows.filter((row) => row.season === CURRENT_SEASON)
  return {
    props: {
      rows: currentSeasonRows,
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
  useTracking('view leagues')

  const [rows, setRows] = usePersistentInMemoryState<league_user_info[]>(
    props.rows,
    'league-rows'
  )

  const [hasLoaded, setHasLoaded] = useState<boolean>(false)
  useEffect(() => {
    getLeagueRows().then((rows) => {
      setRows(rows)
      setHasLoaded(true)
    })
  }, [])

  const rowsBySeason = useMemo(() => groupBy(rows, 'season'), [rows])

  const [season, setSeason] = useState<number>(CURRENT_SEASON)
  const seasonRows = rowsBySeason[season]

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
  const defaultDivision = Math.max(...divisions)

  const [division, setDivision] = useState<number>(defaultDivision)
  const [cohort, setCohort] = useState(divisionToCohorts[defaultDivision][0])
  const [highlightedUserId, setHighlightedUserId] = useState<
    string | undefined
  >()
  const [prizesModalOpen, setPrizesModalOpen] = useState(false)
  const togglePrizesModal = () => {
    setPrizesModalOpen(!prizesModalOpen)
  }

  const user = useUser()
  const userRow = seasonRows.find((row) => row.user_id === user?.id)
  const userDivision = userRow?.division
  const userCohort = userRow?.cohort

  const { query, isReady, replace } = useRouter()
  const { leagueSlugs } = query as { leagueSlugs: string[] }
  const leagueChannelId = getLeagueChatChannelId(season, division, cohort)
  const yourOwnedLeagues = useOwnedLeagueChats(season, user?.id)

  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null)
  const [unseenLeagueChats, setUnseenLeagueChats] = useAllUnseenChatsForLeages(
    user?.id,
    yourOwnedLeagues,
    {
      season,
      division,
      cohort,
    }
  )
  const unseenCohortChats = unseenLeagueChats.map(
    (c) => getSeasonDivisionCohort(c).cohort
  )

  const onSetSeason = (newSeason: number) => {
    const { season, division, cohort } = parseLeaguePath(
      [newSeason.toString()],
      rowsBySeason,
      user?.id
    )

    replace(getLeaguePath(season, division, cohort), undefined, {
      shallow: true,
    })
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
    if (
      !isReady ||
      (!hasLoaded && leagueSlugs && +leagueSlugs[0] !== CURRENT_SEASON)
    ) {
      return
    }

    const { season, division, cohort, highlightedUserId } = parseLeaguePath(
      leagueSlugs ?? [],
      rowsBySeason,
      user?.id
    )
    setSeason(season)
    setDivision(division)
    setCohort(cohort)
    setHighlightedUserId(highlightedUserId)
  }, [isReady, hasLoaded, leagueSlugs, user])

  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCount(division)

  const MARKER = '★'
  const OWNER_MARKER = '🛒'
  const seasonStatus = getSeasonStatus(season)
  const seasonEnd = getSeasonDates(season).end

  const leagueBid = useLeagueBid(season, division, cohort)
  const price = leagueBid
    ? Math.ceil(MIN_BID_INCREASE_FACTOR * leagueBid.amount)
    : MIN_LEAGUE_BID
  const loadedOwner = useUserById(leagueBid?.fromId)
  const owner = leagueBid ? loadedOwner : undefined
  const showNotif = (cohort: string) =>
    query.tab !== 'chat' && unseenCohortChats.includes(cohort)
  return (
    <Page>
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
              <Row className="items-center gap-1.5">
                <ClockIcon className="text-ink-1000 h-4 w-4" />{' '}
                <div className={'text-sm'}>
                  {seasonStatus === 'closing-period' && (
                    <>
                      Ends randomly within 24h:{' '}
                      <Countdown className=" text-sm" endDate={seasonEnd} />
                    </>
                  )}
                  {seasonStatus === 'ended' && (
                    <>Ended at {formatTime(seasonEnd)}</>
                  )}
                  {seasonStatus === 'current' && (
                    <InfoTooltip
                      text={
                        'Once the countdown is reached the leaderboards will freeze at a random time in the following 24h to determine final ranks.'
                      }
                    >
                      <>
                        <Countdown className=" text-sm" endDate={seasonEnd} />
                      </>
                    </InfoTooltip>
                  )}
                </div>
              </Row>
            </Col>
          </Row>

          <Row className="mb-2 items-center gap-3">
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
          <Row className="mt-2 gap-2">
            <Select
              className="!border-ink-200"
              value={division}
              onChange={(e) => onSetDivision(+e.target.value)}
            >
              {divisions.map((division) => (
                <option key={division} value={division}>
                  {division === userDivision
                    ? MARKER
                    : yourOwnedLeagues.filter((l) => l.division === division)[0]
                    ? OWNER_MARKER
                    : ''}{' '}
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
                  {cohort === userCohort
                    ? MARKER
                    : yourOwnedLeagues.filter(
                        (l) => l.division === division && l.cohort === cohort
                      )[0]
                    ? OWNER_MARKER
                    : ''}{' '}
                  {toLabel(cohort)}
                  {showNotif(cohort) && '🔵'}{' '}
                </option>
              ))}
            </Select>
          </Row>
        </Col>

        {owner && (
          <Row className="mx-3 gap-2 sm:mb-2 ">
            <Col className={'gap-2'}>
              <div className="text-ink-600 text-sm">
                Owner of {toLabel(cohort)}
              </div>
              <Row className="items-center gap-2">
                <Avatar
                  avatarUrl={owner.avatarUrl}
                  username={owner.username}
                  size={'xs'}
                />
                <UserLink name={owner.name} username={owner.username} />
              </Row>
            </Col>
            {IS_BIDDING_PERIOD && (
              <LeagueBidPanel
                season={season}
                division={division}
                cohort={cohort}
                minAmount={price}
              />
            )}
          </Row>
        )}

        <div className={'h-0'} ref={setContainerRef} />
        <QueryUncontrolledTabs
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
            {
              title: 'Chat',
              inlineTabIcon: showNotif(cohort) && (
                <ChatIcon className="h-5 w-5 text-blue-600" />
              ),
              content: (
                <LeagueChat
                  user={user}
                  channelId={leagueChannelId}
                  ownerId={owner?.id}
                  offsetTop={(containerRef?.offsetTop ?? 0) + 47}
                  setSeen={(channelId) => {
                    setUnseenLeagueChats(
                      unseenLeagueChats.filter((c) => c !== channelId)
                    )
                  }}
                />
              ),
            },
          ]}
        />
      </Col>
    </Page>
  )
}
