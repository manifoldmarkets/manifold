import { Fragment, useEffect, useMemo, useState } from 'react'
import { groupBy, keyBy, sortBy, uniq } from 'lodash'
import clsx from 'clsx'
import { ClockIcon } from '@heroicons/react/outline'
import { useRouter } from 'next/router'

import {
  DIVISION_NAMES,
  SEASONS,
  SEASON_END,
  SECRET_NEXT_DIVISION,
  getDemotionAndPromotionCount,
  league_row,
  season,
  rewardsData,
  CURRENT_SEASON,
  getLeaguePath,
  SEASON_START,
} from 'common/leagues'
import { toLabel } from 'common/util/adjective-animal'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { Title } from 'web/components/widgets/title'
import { useUsers } from 'web/hooks/use-user-supabase'
import { User } from 'common/user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { formatMoney } from 'common/util/format'
import { useUser } from 'web/hooks/use-user'
import { Countdown } from 'web/components/widgets/countdown'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { useTracking } from 'web/hooks/use-tracking'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getLeagueRows } from 'web/lib/supabase/leagues'
import { Table } from 'web/components/widgets/table'
import { useBets } from 'web/hooks/use-bets-supabase'
import { usePublicContracts } from 'web/hooks/use-contract-supabase'
import { FeedBet } from 'web/components/feed/feed-bets'
import { ContractMention } from 'web/components/contract/contract-mention'
import { Subtitle } from 'web/components/widgets/subtitle'

export async function getStaticProps() {
  const rows = await getLeagueRows()
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

export default function Leagues(props: { rows: league_row[] }) {
  useTracking('view leagues')

  const [rows, setRows] = usePersistentInMemoryState<league_row[]>(
    props.rows,
    'league-rows'
  )

  useEffect(() => {
    getLeagueRows().then(setRows)
  }, [])

  const cohorts = groupBy(rows, 'cohort')
  const cohortNames = Object.keys(cohorts)
  const divisionToCohorts = groupBy(
    cohortNames,
    (cohort) => cohorts[cohort][0].division
  )
  const divisions = sortBy(
    Object.keys(divisionToCohorts).map((division) => +division),
    (division) => division
  ).reverse()

  const [season, setSeason] = useState<number>(1)
  const [division, setDivision] = useState<number>(4)
  const [cohort, setCohort] = useState(divisionToCohorts[4][0])
  const [highlightedUserId, setHighlightedUserId] = useState<
    string | undefined
  >()
  const [prizesModalOpen, setPrizesModalOpen] = useState(false)
  const togglePrizesModal = () => {
    setPrizesModalOpen(!prizesModalOpen)
  }

  const user = useUser()
  const { query, isReady, replace } = useRouter()
  const { leagueSlugs } = query as { leagueSlugs: string[] }

  const onSetDivision = (division: number) => {
    setDivision(division)

    const userRow = rows.find(
      (row) => row.user_id === user?.id && row.division === division
    )
    const cohort = userRow ? userRow.cohort : divisionToCohorts[division][0]
    setCohort(cohort)

    replace(getLeaguePath(season, division, cohort))
  }

  const onSetCohort = (cohort: string) => {
    setCohort(cohort)
    replace(getLeaguePath(season, division, cohort))
  }

  const userRow = rows.find((row) => row.user_id === user?.id)
  const userDivision = userRow?.division
  const userCohort = userRow?.cohort

  useEffect(() => {
    if (!isReady) return

    if (leagueSlugs) {
      const [season, division, cohort, userId] = leagueSlugs
      if (SEASONS.includes(+season as season)) {
        setSeason(+season)
      } else {
        setSeason(CURRENT_SEASON)
      }

      let divisionNum: number | undefined
      if (Object.keys(DIVISION_NAMES).includes(division)) {
        divisionNum = +division
      } else {
        const divisionName = Object.keys(DIVISION_NAMES).find(
          (key) =>
            DIVISION_NAMES[key]?.toLowerCase() === division?.toLowerCase()
        )
        if (divisionName) divisionNum = +divisionName
      }

      if (divisionNum) {
        setDivision(divisionNum)

        const cohorts = divisionToCohorts[divisionNum] ?? []
        const matchedCohort = cohorts.find(
          (c) => c?.toLowerCase() === cohort?.toLowerCase()
        )
        if (matchedCohort) {
          setCohort(matchedCohort)

          if (
            userId &&
            rows.find(
              (row) => row.user_id === userId && row.division === divisionNum
            )
          ) {
            setHighlightedUserId(userId)
          }
        }
      }
    } else if (userRow) {
      setDivision(userRow.division)
      setCohort(userRow.cohort)
      setHighlightedUserId(userRow.user_id)
    }
  }, [isReady, leagueSlugs, user])

  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCount(division)

  const MARKER = '●️'

  return (
    <Page>
      <Col className="mx-auto w-full max-w-lg pb-8 pt-2 sm:pt-0">
        <Col className="px-2 sm:px-0">
          <Row className="mb-4 justify-between">
            <Title className="!mb-0">Leagues</Title>
          </Row>

          <Row className="mb-4 items-center gap-3">
            <text className="">
              Compete against similarly skilled users for{' '}
              <span
                className="cursor-pointer border-b border-dotted border-blue-600 text-blue-600 hover:text-blue-800"
                onClick={togglePrizesModal}
              >
                prizes
              </span>{' '}
              and promotion by earning the most mana this month!
            </text>

            <Modal
              open={prizesModalOpen}
              setOpen={togglePrizesModal}
              size={'md'}
            >
              <div className="bg-canvas-0 text-ink-1000 rounded-lg p-3">
                <Col className={'mb-2 justify-center gap-2'}>
                  <Title className={'!mb-1'}>Prizes</Title>
                  <div className={'justify-center'}>
                    {' '}
                    Win mana at the end of the season based on your division and
                    finishing rank.{' '}
                  </div>
                </Col>
                <Col className="m-4 items-center justify-center">
                  <table>
                    {
                      <table className="table-auto border-collapse border border-gray-300">
                        <thead>
                          <tr>
                            <th className="border border-gray-300 px-4 py-2">
                              Rank
                            </th>
                            <th className="border border-gray-300 px-4 py-2">
                              Bronze
                            </th>
                            <th className="border border-gray-300 px-4 py-2">
                              Silver
                            </th>
                            <th className="border border-gray-300 px-4 py-2">
                              Gold
                            </th>
                            <th className="border border-gray-300 px-4 py-2">
                              Platinum
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 10 }, (_, i) => (
                            <tr key={i}>
                              <td className="border border-gray-300 px-4 py-2 text-center font-black">
                                {i + 1}
                              </td>
                              {rewardsData.map((columnData, j) => (
                                <td
                                  key={j}
                                  className="border border-gray-300 px-4 py-2 text-center"
                                >
                                  {columnData[i]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    }
                  </table>
                </Col>
              </div>
            </Modal>
          </Row>
          <Row className="items-center gap-3">
            <Col className="items-center gap-1">
              <Select
                className="!border-ink-200 !h-10"
                value={season}
                onChange={(e) => setSeason(+e.target.value as season)}
              >
                {SEASONS.map((season) => (
                  <option key={season} value={season}>
                    Season {season}: May
                  </option>
                ))}
              </Select>
            </Col>
            <Col className="items-center gap-1">
              <Row className="items-center gap-1.5">
                <ClockIcon className="text-ink-1000 h-4 w-4" />{' '}
                <Row className={' gap-1 text-sm'}>
                  <InfoTooltip
                    text={
                      'Once the countdown is reached the leaderboards will freeze at a random time in the following 24h to determine final ranks.'
                    }
                  >
                    Ends in{' '}
                    <Countdown className=" text-sm" endDate={SEASON_END} />
                  </InfoTooltip>
                </Row>
              </Row>
            </Col>
          </Row>
          <Row className="mt-2 gap-2">
            <Select
              className="!border-ink-200"
              value={division}
              onChange={(e) => onSetDivision(+e.target.value)}
            >
              {divisions.map((division) => (
                <option key={division} value={division}>
                  {division === userDivision && MARKER}{' '}
                  {DIVISION_NAMES[division]}
                </option>
              ))}
            </Select>

            <Select
              className="!border-ink-200"
              value={cohort}
              onChange={(e) => onSetCohort(e.target.value)}
            >
              {divisionToCohorts[division].map((cohort) => (
                <option key={cohort} value={cohort}>
                  {cohort === userCohort && MARKER} {toLabel(cohort)}
                </option>
              ))}
            </Select>
          </Row>
        </Col>

        <Col className="mt-4">
          <CohortTable
            cohort={cohort}
            rows={cohorts[cohort]}
            highlightedUserId={highlightedUserId}
            demotionCount={demotion}
            promotionCount={promotion}
            doublePromotionCount={doublePromotion}
          />
        </Col>
      </Col>
    </Page>
  )
}

const CohortTable = (props: {
  cohort: string
  rows: league_row[]
  highlightedUserId: string | undefined
  demotionCount: number
  promotionCount: number
  doublePromotionCount: number
}) => {
  const {
    rows,
    highlightedUserId,
    demotionCount,
    promotionCount,
    doublePromotionCount,
  } = props
  const users = useUsers(rows.map((row) => row.user_id))
  if (!users || users.length !== rows.length) return <LoadingIndicator />

  const division = rows[0].division
  const nextDivision = division + 1
  const nextNextDivision = division + 2
  const nextDivisionName = DIVISION_NAMES[nextDivision] ?? SECRET_NEXT_DIVISION
  const nextNextDivisionName =
    DIVISION_NAMES[nextNextDivision] ?? SECRET_NEXT_DIVISION
  const prevDivison = Math.max(division - 1, 1)
  const prevDivisionName = DIVISION_NAMES[prevDivison]

  return (
    <table>
      <thead className={clsx('text-ink-600 text-left text-sm font-semibold')}>
        <tr>
          <th className={clsx('px-2 pb-1')}>User</th>
          <th className={clsx('px-2 pb-1 text-right')}>
            <InfoTooltip
              text={
                'Includes both realized and unrealized profits from bets placed this month plus quest rewards and unique trader bonuses.'
              }
            >
              Mana earned{' '}
            </InfoTooltip>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const user = users[i]
          return (
            <Fragment key={user.id}>
              {user && (
                <UserRow
                  {...row}
                  user={users[i]}
                  rank={i + 1}
                  isHighlighted={highlightedUserId === user.id}
                  mana_earned_breakdown={row.mana_earned_breakdown as any}
                />
              )}
              {doublePromotionCount > 0 && i + 1 === doublePromotionCount && (
                <tr>
                  <td colSpan={2}>
                    <Col className="mb-2 w-full items-center gap-1">
                      <div className="text-xs text-gray-600">
                        ▲ Promotes to {nextNextDivisionName}
                      </div>
                      <div className="border-ink-300 w-full border-t-2 border-dashed" />
                    </Col>
                  </td>
                </tr>
              )}
              {promotionCount > 0 && i + 1 === promotionCount && (
                <tr>
                  <td colSpan={2}>
                    <Col className="mb-2 w-full items-center gap-1">
                      <div className="text-xs text-gray-600">
                        ▲ Promotes to {nextDivisionName}
                      </div>
                      <div className="border-ink-300 w-full border-t-2 border-dashed" />
                    </Col>
                  </td>
                </tr>
              )}
              {demotionCount > 0 && rows.length - (i + 1) === demotionCount && (
                <tr>
                  <td colSpan={2}>
                    <Col className="mt-2 w-full items-center gap-1">
                      <div className="border-ink-300 w-full border-t-2 border-dashed" />
                      <div className="text-xs text-gray-600">
                        ▼ Demotes to {prevDivisionName}
                      </div>
                    </Col>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

const UserRow = (props: {
  user: User
  mana_earned: number
  mana_earned_breakdown: { [key: string]: number }
  rank: number
  isHighlighted: boolean
}) => {
  const { user, mana_earned, mana_earned_breakdown, rank, isHighlighted } =
    props

  const [showDialog, setShowDialog] = useState(false)

  return (
    <tr
      className={clsx(
        'hover:bg-canvas-100 group cursor-pointer',
        isHighlighted && `bg-canvas-100 sticky bottom-[58px] sm:bottom-0`
      )}
      onClick={() => {
        setShowDialog(true)
      }}
    >
      <td
        className={clsx(
          'pl-2 group-hover:bg-indigo-400/20',
          isHighlighted && 'bg-indigo-400/20'
        )}
      >
        <Row className="my-2 items-center gap-4">
          <div className="w-4 text-right font-semibold">{rank}</div>
          <UserAvatarAndBadge
            name={user.name}
            username={user.username}
            avatarUrl={user.avatarUrl}
          />
        </Row>
      </td>
      <td
        className={clsx(
          isHighlighted && 'bg-indigo-400/20',
          'pr-2 text-right group-hover:bg-indigo-400/20'
        )}
      >
        {formatMoney(mana_earned)}
      </td>

      {showDialog && (
        <UserManaEarnedBreakdown
          user={user}
          showDialog={showDialog}
          setShowDialog={setShowDialog}
          mana_earned={mana_earned}
          mana_earned_breakdown={mana_earned_breakdown}
        />
      )}
    </tr>
  )
}

const UserManaEarnedBreakdown = (props: {
  user: User
  showDialog: boolean
  setShowDialog: (show: boolean) => void
  mana_earned: number
  mana_earned_breakdown: { [key: string]: number }
}) => {
  const {
    user,
    showDialog,
    setShowDialog,
    mana_earned,
    mana_earned_breakdown,
  } = props

  const breakdown = {
    PROFIT: mana_earned_breakdown.profit,
    ...mana_earned_breakdown,
    MARKET_BOOST_REDEEM:
      (mana_earned_breakdown.MARKET_BOOST_REDEEM ?? 0) +
      (mana_earned_breakdown.AD_REDEEM ?? 0),
  } as { [key: string]: number }

  const loadingBets = useBets({
    userId: user.id,
    afterTime: SEASON_START.getTime(),
    beforeTime: SEASON_END.getTime(),
  })
  const bets = loadingBets ?? []

  const contracts = usePublicContracts(
    loadingBets ? uniq(loadingBets.map((b) => b.contractId)) : undefined
  )

  const betIdToContract = useMemo(() => {
    const contractsById = keyBy(contracts, 'id')
    return Object.fromEntries(
      bets.map((bet) => [bet.id, contractsById[bet.contractId]])
    )
  }, [contracts])

  return (
    <Modal
      className={clsx(MODAL_CLASS, '')}
      open={showDialog}
      setOpen={(open) => setShowDialog(open)}
    >
      <Col>
        <Row className="mb-2 items-center gap-4">
          <UserAvatarAndBadge
            name={user.name}
            username={user.username}
            avatarUrl={user.avatarUrl}
          />
        </Row>
        <Table>
          <thead
            className={clsx('text-ink-600 text-left text-sm font-semibold')}
          >
            <tr>
              <th className={clsx('px-2 pb-1')}>Earning type</th>
              <th className={clsx('px-2 pb-1 text-right')}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(MANA_EARNED_CATEGORY_LABELS).map((category) => (
              <tr key={category}>
                <td className={clsx('pl-2')}>
                  {MANA_EARNED_CATEGORY_LABELS[category]}
                </td>
                <td className={clsx('pr-2 text-right')}>
                  {formatMoney(breakdown[category] ?? 0)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className={clsx('pl-2')}>Total</td>
              <td className={clsx('pr-2 text-right')}>
                {formatMoney(mana_earned)}
              </td>
            </tr>
          </tbody>
        </Table>

        {contracts && contracts.length > 0 && (
          <Subtitle className="mt-4">Trades this season</Subtitle>
        )}
        {contracts === undefined && (
          <div className="h-[500px]">
            <LoadingIndicator className="mt-6" />
          </div>
        )}
        <Col className="divide-y-[0.5px]">
          {bets.map(
            (bet) =>
              betIdToContract[bet.id] && (
                <Col className="gap-2 py-4 first:border-t-[0.5px]">
                  <ContractMention contract={betIdToContract[bet.id]} />
                  <FeedBet
                    key={bet.id}
                    bet={bet}
                    contract={betIdToContract[bet.id]}
                  />
                </Col>
              )
          )}
        </Col>
      </Col>
    </Modal>
  )
}

const MANA_EARNED_CATEGORY_LABELS = {
  PROFIT: 'Profit',
  BETTING_STREAK_BONUS: 'Streak bonuses',
  QUEST_REWARD: 'Quests',
  MARKET_BOOST_REDEEM: 'Boosts claimed',
  UNIQUE_BETTOR_BONUS: 'Trader bonuses',
} as { [key: string]: string }
