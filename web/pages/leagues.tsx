import { Fragment, useEffect, useState } from 'react'
import { groupBy, sortBy } from 'lodash'
import clsx from 'clsx'
import { ClockIcon } from '@heroicons/react/outline'

import {
  DIVISION_NAMES,
  SEASONS,
  SEASON_END,
  SECRET_NEXT_DIVISION,
  getDemotionAndPromotionCount,
  league_row,
  season,
} from 'common/leagues'
import { toLabel } from 'common/util/adjective-animal'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { Title } from 'web/components/widgets/title'
import { db } from 'web/lib/supabase/db'
import { useUsers } from 'web/hooks/use-user-supabase'
import { User } from 'common/user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { formatMoney } from 'common/util/format'
import { useUser } from 'web/hooks/use-user'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Countdown } from 'web/components/widgets/countdown'

export async function getStaticProps() {
  const { data: rows } = await db
    .from('leagues')
    .select('*')
    .order('mana_earned', { ascending: false })
  return {
    props: {
      rows: rows ?? [],
    },
  }
}

export default function Leagues(props: { rows: league_row[] }) {
  const { rows } = props

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

  const [season, setSeason] = useState<season>(1)
  const [division, setDivision] = useState<number>(1)
  const [cohort, setCohort] = useState(cohortNames[0])

  const user = useUser()
  const onSetDivision = (division: number) => {
    setDivision(division)

    const userRow = rows.find(
      (row) => row.user_id === user?.id && row.division === division
    )
    setCohort(userRow ? userRow.cohort : divisionToCohorts[division][0])
  }

  const userRow = rows.find((row) => row.user_id === user?.id)
  const userDivision = userRow?.division
  const userCohort = userRow?.cohort
  useEffect(() => {
    if (userRow) {
      setDivision(userRow.division)
      setCohort(userRow.cohort)
    }
  }, [user])

  const { demotion, promotion } = getDemotionAndPromotionCount(division)

  const MARKER = '●️'

  return (
    <Page>
      <Col className="mx-auto w-full max-w-lg pb-8 pt-2 sm:pt-0">
        <Col className="px-2 sm:px-0">
          <Row className="mb-4 justify-between">
            <Title className="!mb-0">Leagues</Title>

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
                <Row className="items-center gap-1">
                  <ClockIcon className="text-ink-1000 h-4 w-4" />{' '}
                  <Countdown className="text-sm" endDate={SEASON_END} />
                </Row>
              </Col>
            </Row>
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
              onChange={(e) => setCohort(e.target.value)}
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
            currUserId={user?.id}
            demotionCount={demotion}
            promotionCount={promotion}
          />
        </Col>
      </Col>
    </Page>
  )
}

const CohortTable = (props: {
  cohort: string
  rows: league_row[]
  currUserId: string | undefined
  demotionCount: number
  promotionCount: number
}) => {
  const { rows, currUserId, demotionCount, promotionCount } = props
  const users = useUsers(rows.map((row) => row.user_id))
  if (!users) return <LoadingIndicator />

  const division = rows[0].division
  const nextDivision = division + 1
  const nextDivisionName = DIVISION_NAMES[nextDivision] ?? SECRET_NEXT_DIVISION
  const prevDivison = Math.max(division - 1, 1)
  const prevDivisionName = DIVISION_NAMES[prevDivison]

  return (
    <table>
      <thead className={clsx('text-ink-600 text-left text-sm font-semibold')}>
        <tr>
          <th className={clsx('px-2 pb-1')}>User</th>
          <th className={clsx('px-2 pb-1 text-right')}>Mana earned</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const user = users[i]
          if (!user) console.log('no user', row)
          return (
            <Fragment key={user.id}>
              {user && (
                <UserRow
                  {...row}
                  user={users[i]}
                  rank={i + 1}
                  isUser={currUserId === user.id}
                />
              )}

              {promotionCount > 0 && i + 1 === promotionCount && (
                <tr>
                  <td colSpan={2}>
                    <Col className="mb-2 w-full items-center gap-2">
                      <div>
                        Promotion{' '}
                        <InfoTooltip
                          text={`Top ${promotionCount} users promote to ${nextDivisionName} next season`}
                        />
                      </div>
                      <div className="border-ink-300 w-full border-t-2 border-dashed" />
                    </Col>
                  </td>
                </tr>
              )}
              {demotionCount > 0 && rows.length - (i + 1) === demotionCount && (
                <tr>
                  <td colSpan={2}>
                    <Col className="mt-2 w-full items-center gap-2">
                      <div className="border-ink-300 w-full border-t-2 border-dashed" />
                      <div>
                        Demotion{' '}
                        <InfoTooltip
                          text={`Bottom ${demotionCount} users demote to ${prevDivisionName} next season`}
                        />
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
  rank: number
  isUser: boolean
}) => {
  const { user, mana_earned, rank, isUser } = props

  return (
    <tr
      className={clsx(
        isUser && `bg-canvas-100 sticky bottom-[58px] sm:bottom-0`
      )}
    >
      <td className={clsx('pl-2', isUser && 'bg-indigo-400/20')}>
        <Row className="my-2 items-center gap-4">
          <div className="w-4 text-right font-semibold">{rank}</div>
          <UserAvatarAndBadge
            name={user.name}
            username={user.username}
            avatarUrl={user.avatarUrl}
          />
        </Row>
      </td>
      <td className={clsx(isUser && 'bg-indigo-400/20', 'pr-2 text-right')}>
        {formatMoney(mana_earned)}
      </td>
    </tr>
  )
}
