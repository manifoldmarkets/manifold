import clsx from 'clsx'
import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/solid'

import { Fragment, useState } from 'react'
import { Row } from '../layout/row'
import {
  DIVISION_NAMES,
  league_user_info,
} from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { User } from 'common/user'
import { useUsers } from 'web/hooks/use-user-supabase'
import { Col } from '../layout/col'
import { InfoTooltip } from '../widgets/info-tooltip'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { UserAvatarAndBadge } from '../widgets/user-link'
import { ManaEarnedBreakdown } from './mana-earned-breakdown'
import { Tooltip } from '../widgets/tooltip'

export const CohortTable = (props: {
  cohort: string
  rows: league_user_info[]
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
  const nextDivisionName = DIVISION_NAMES[nextDivision]
  const nextNextDivisionName = DIVISION_NAMES[nextNextDivision]
  const prevDivison = Math.max(division - 1, 1)
  const prevDivisionName = DIVISION_NAMES[prevDivison]

  const noPromotionDemotion = cohort === 'bots'

  return (
    <table>
      <thead className={clsx('text-ink-600 text-left text-sm font-semibold')}>
        <tr>
          <th className={clsx('pl-10 pr-2 pb-1')}>User</th>
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
  rank_snapshot: number | null
  isHighlighted: boolean
}) => {
  const {
    user,
    mana_earned,
    mana_earned_breakdown,
    rank,
    rank_snapshot,
    isHighlighted,
  } = props

  const [showDialog, setShowDialog] = useState(false)

  const rankDiff = rank_snapshot ? rank - rank_snapshot : 0

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
          <Tooltip
            text={
              rankDiff
                ? `${rankDiff < 0 ? 'Gained' : 'Lost'} ${Math.abs(
                    rankDiff
                  )} rank${Math.abs(rankDiff) > 1 ? 's' : ''} today`
                : undefined
            }
          >
            <Row>
              {rankDiff < -1 ? (
                <ChevronDoubleUpIcon className="h-6 w-6 text-teal-500" />
              ) : rankDiff === -1 ? (
                <ChevronUpIcon className="h-6 w-6 text-teal-500" />
              ) : rankDiff === 1 ? (
                <ChevronDownIcon className="text-scarlet-500 h-6 w-6" />
              ) : rankDiff > 1 ? (
                <ChevronDoubleDownIcon className="text-scarlet-500 h-6 w-6" />
              ) : (
                <div className="h-6 w-6" />
              )}
              <div className="w-4 text-right font-semibold">{rank}</div>
            </Row>
          </Tooltip>
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
