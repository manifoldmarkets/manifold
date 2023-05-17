import clsx from 'clsx'
import { Fragment, useState } from 'react'
import { Row } from '../layout/row'
import {
  league_row,
  DIVISION_TRAITS,
  SECRET_NEXT_DIVISION,
} from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { User } from 'common/user'
import { useUsers } from 'web/hooks/use-user-supabase'
import { Col } from '../layout/col'
import { InfoTooltip } from '../widgets/info-tooltip'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { UserAvatarAndBadge } from '../widgets/user-link'
import { ManaEarnedBreakdown } from './mana-earned-breakdown'

export const CohortTable = (props: {
  cohort: string
  rows: league_row[]
  highlightedUserId: string | undefined
  demotionCount: number
  promotionCount: number
  doublePromotionCount: number
}) => {
  const {
    cohort,
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
  const nextDivisionName =
    DIVISION_TRAITS[nextDivision].name ?? SECRET_NEXT_DIVISION
  const nextNextDivisionName =
    DIVISION_TRAITS[nextNextDivision].name ?? SECRET_NEXT_DIVISION
  const prevDivison = Math.max(division - 1, 1)
  const prevDivisionName = DIVISION_TRAITS[prevDivison].name

  const noPromotionDemotion = cohort === 'bots'

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
              {!noPromotionDemotion && (
                <>
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
                  {demotionCount > 0 &&
                    rows.length - (i + 1) === demotionCount && (
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
                </>
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
            noLink
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
        <ManaEarnedBreakdown
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
