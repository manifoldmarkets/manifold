import { useEffect, useState } from 'react'
import { groupBy, sortBy } from 'lodash'
import clsx from 'clsx'

import {
  SEASONS,
  SEASON_END,
  division,
  getDemotionAndPromotionCount,
  getDivisionName,
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

export default function Leagues(props: { rows: any[] }) {
  const { rows } = props

  const cohorts = groupBy(rows, 'cohort')
  const cohortNames = Object.keys(cohorts)
  const divisionToCohorts = groupBy(
    cohortNames,
    (cohort) => cohorts[cohort][0].division
  )
  const divisions = sortBy(
    Object.keys(divisionToCohorts),
    (division) => division
  ).reverse()

  const [season, setSeason] = useState<season>(1)
  const [division, setDivision] = useState<division>(1)
  const [cohort, setCohort] = useState(cohortNames[0])

  const user = useUser()
  const onSetDivision = (division: division) => {
    setDivision(division)

    const userRow = rows.find(
      (row) => row.user_id === user?.id && row.division === division
    )
    setCohort(userRow ? userRow.cohort : divisionToCohorts[division][0])
  }

  useEffect(() => {
    const userRow = rows.find((row) => row.user_id === user?.id)
    if (userRow) {
      setDivision(userRow.division)
      setCohort(userRow.cohort)
    }
  }, [user])

  const { demotion, promotion } = getDemotionAndPromotionCount(division)

  return (
    <Page>
      <Col className="mx-auto w-full max-w-lg px-4 pb-8 sm:px-2">
        <Title>Leagues</Title>

        <Col className="gap-2 sm:flex-row sm:justify-between">
          <Select
            className="!border-ink-200"
            value={season}
            onChange={(e) => setSeason(+e.target.value as season)}
          >
            {SEASONS.map((season) => (
              <option key={season} value={season}>
                Season {season}
              </option>
            ))}
          </Select>

          <Select
            className="!border-ink-200"
            value={division}
            onChange={(e) => onSetDivision(+e.target.value as division)}
          >
            {divisions.map((division) => (
              <option key={division} value={division}>
                {getDivisionName(division)}
              </option>
            ))}
          </Select>

          <Select
            className="!border-ink-200"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
          >
            {divisionToCohorts[division].map((cohortName) => (
              <option key={cohortName} value={cohortName}>
                {toLabel(cohortName)}
              </option>
            ))}
          </Select>
        </Col>

        <Row className="mt-4 items-baseline gap-2 self-end">
          <span className="font-semibold text-sm text-ink-900">Season end:</span>
          <Countdown className="text-sm" endDate={SEASON_END} />
        </Row>

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
  rows: any[]
  currUserId: string | undefined
  demotionCount: number
  promotionCount: number
}) => {
  const { rows, currUserId, demotionCount, promotionCount } = props
  const users = useUsers(rows.map((row) => row.user_id))
  if (!users) return <LoadingIndicator />

  return (
    <table>
      <thead className={clsx('text-ink-600 text-left text-sm font-semibold')}>
        <tr>
          <th className={clsx('pb-1')}>User</th>
          <th className={clsx('pb-1 text-right')}>Mana earned</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const user = users[i]
          if (!user) console.log('no user', row)
          return (
            <>
              {user && (
                <UserRow
                  key={user.id}
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
                      <div>Promotion</div>
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
                      <div>Demotion</div>
                    </Col>
                  </td>
                </tr>
              )}
            </>
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
    <tr className={clsx(isUser && 'bg-indigo-400/20')}>
      <td>
        <Row className="my-2 items-center gap-4">
          <div className="w-4 text-right font-semibold">{rank}</div>
          <UserAvatarAndBadge
            name={user.name}
            username={user.username}
            avatarUrl={user.avatarUrl}
          />
        </Row>
      </td>
      <td className="text-right">{formatMoney(mana_earned)}</td>
    </tr>
  )
}
