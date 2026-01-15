import clsx from 'clsx'
import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/solid'
import { Fragment, useState } from 'react'
import Link from 'next/link'

import { Row } from '../layout/row'
import { DIVISION_NAMES, league_user_info } from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { useUsers } from 'web/hooks/use-user-supabase'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Avatar } from '../widgets/avatar'
import { ManaEarnedBreakdown } from './mana-earned-breakdown'
import { Tooltip } from '../widgets/tooltip'
import { DisplayUser } from 'common/api/user-types'
import { getRankZoneStyles } from './division-badge'

export const CohortTable = (props: {
  season: number
  cohort: string
  rows: league_user_info[]
  highlightedUserId: string | undefined
  demotionCount: number
  promotionCount: number
  doublePromotionCount: number
}) => {
  const {
    season,
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
  const prevDivision = Math.max(division - 1, 1)
  const prevDivisionName = DIVISION_NAMES[prevDivision]

  const noPromotionDemotion = cohort === 'bots'
  const shouldTruncateZeros = division === 1 || division === 2 || division === 3

  const adjustedDoublePromotionCount =
    division === 1
      ? Math.min(
          rows.findLastIndex((row) => row.mana_earned >= 100) + 1,
          doublePromotionCount
        )
      : doublePromotionCount
  const adjustedPromotionCount =
    division === 1
      ? Math.min(
          rows.findLastIndex((row) => row.mana_earned >= 100) + 1,
          promotionCount
        )
      : promotionCount

  return (
    <Col className="gap-3">
      {division === 1 && (
        <p className="text-ink-500 text-sm">
          Requires 100 mana earned to promote from Bronze
        </p>
      )}


      <Col className="bg-canvas-0 divide-ink-100 divide-y rounded-lg border border-ink-200">
        {rows.map((row, i) => {
          const user = users[i]
          if (!user) return null

          const zoneStyles = !noPromotionDemotion
            ? getRankZoneStyles(
                row.rank,
                rows.length,
                adjustedPromotionCount,
                adjustedDoublePromotionCount,
                demotionCount
              )
            : { zone: 'stay' as const, classes: '' }

          const shouldShow =
            !shouldTruncateZeros ||
            !!row.mana_earned ||
            highlightedUserId === user.id

          return (
            <Fragment key={user.id}>
              {user && shouldShow && (
                <UserRow
                  {...row}
                  user={user}
                  isHighlighted={highlightedUserId === user.id}
                  mana_earned_breakdown={row.mana_earned_breakdown as any}
                  season={season}
                  zoneClasses={zoneStyles.classes}
                  isFirst={i === 0}
                  isLast={i === rows.length - 1}
                />
              )}
              {user &&
                shouldTruncateZeros &&
                row.mana_earned === 0 &&
                (i === rows.length - 1 || rows[i + 1].mana_earned !== 0) && (
                  <Row className="text-ink-400 justify-center py-3 text-sm">
                    ···
                  </Row>
                )}
              {!noPromotionDemotion && (
                <>
                  {adjustedDoublePromotionCount > 0 &&
                    i + 1 === adjustedDoublePromotionCount && (
                      <ZoneDivider
                        label={`Promotes to ${nextNextDivisionName}`}
                        type="promote"
                      />
                    )}
                  {adjustedDoublePromotionCount !== adjustedPromotionCount &&
                    adjustedPromotionCount > 0 &&
                    i + 1 === adjustedPromotionCount && (
                      <ZoneDivider
                        label={`Promotes to ${nextDivisionName}`}
                        type="promote"
                      />
                    )}
                  {demotionCount > 0 &&
                    rows.length - (i + 1) === demotionCount && (
                      <ZoneDivider
                        label={`Demotes to ${prevDivisionName}`}
                        type="demote"
                      />
                    )}
                </>
              )}
            </Fragment>
          )
        })}
      </Col>
    </Col>
  )
}

function ZoneDivider(props: { label: string; type: 'promote' | 'demote' }) {
  const { label, type } = props

  return (
    <Row className="items-center gap-3 px-4 py-2">
      <div
        className={clsx(
          'h-px flex-1',
          type === 'promote' ? 'bg-teal-300' : 'bg-scarlet-300'
        )}
      />
      <span
        className={clsx(
          'text-xs font-medium',
          type === 'promote' ? 'text-teal-600' : 'text-scarlet-600'
        )}
      >
        {label}
      </span>
      <div
        className={clsx(
          'h-px flex-1',
          type === 'promote' ? 'bg-teal-300' : 'bg-scarlet-300'
        )}
      />
    </Row>
  )
}

const UserRow = (props: {
  user: DisplayUser
  season: number
  mana_earned: number
  mana_earned_breakdown: { [key: string]: number }
  rank: number
  rank_snapshot: number | null
  isHighlighted: boolean
  zoneClasses: string
  isFirst: boolean
  isLast: boolean
}) => {
  const {
    user,
    season,
    mana_earned,
    mana_earned_breakdown,
    rank,
    rank_snapshot,
    isHighlighted,
    zoneClasses,
    isFirst,
    isLast,
  } = props

  const [showDialog, setShowDialog] = useState(false)
  const rankDiff = rank_snapshot ? rank - rank_snapshot : 0

  return (
    <>
      <div
        className={clsx(
          'group cursor-pointer transition-colors hover:bg-canvas-50',
          isHighlighted && 'bg-primary-50',
          zoneClasses,
          isFirst && 'rounded-t-lg',
          isLast && 'rounded-b-lg'
        )}
        onClick={() => setShowDialog(true)}
      >
        <Row className="items-center gap-3 px-4 py-3">
          {/* Rank */}
          <Row className="w-14 shrink-0 items-center gap-1">
            <Tooltip
              text={
                rankDiff
                  ? `${rankDiff < 0 ? 'Up' : 'Down'} ${Math.abs(rankDiff)} today`
                  : undefined
              }
            >
              <Row className="items-center gap-0.5">
                <div className="w-4">
                  {rankDiff < -1 ? (
                    <ChevronDoubleUpIcon className="h-4 w-4 text-teal-500" />
                  ) : rankDiff === -1 ? (
                    <ChevronUpIcon className="h-4 w-4 text-teal-500" />
                  ) : rankDiff === 1 ? (
                    <ChevronDownIcon className="h-4 w-4 text-scarlet-500" />
                  ) : rankDiff > 1 ? (
                    <ChevronDoubleDownIcon className="h-4 w-4 text-scarlet-500" />
                  ) : null}
                </div>
                <span
                  className={clsx(
                    'text-sm font-medium tabular-nums',
                    rank <= 3 ? 'text-ink-900' : 'text-ink-600'
                  )}
                >
                  {rank}
                </span>
              </Row>
            </Tooltip>
          </Row>

          {/* User info */}
          <Row className="min-w-0 flex-1 items-center gap-2.5">
            <Avatar
              avatarUrl={user.avatarUrl}
              username={user.username}
              size="sm"
              noLink
            />
            <Link
              href={`/${user.username}`}
              onClick={(e) => e.stopPropagation()}
              className="text-ink-900 truncate text-sm font-medium hover:underline"
            >
              {user.name}
            </Link>
          </Row>

          {/* Mana earned */}
          <span
            className={clsx(
              'shrink-0 text-sm font-medium tabular-nums',
              mana_earned > 0
                ? 'text-teal-600'
                : mana_earned < 0
                  ? 'text-scarlet-500'
                  : 'text-ink-1000'
            )}
          >
            {mana_earned > 0 ? '+' : ''}
            {formatMoney(mana_earned)}
          </span>
        </Row>
      </div>

      {showDialog && (
        <ManaEarnedBreakdown
          user={user}
          season={season}
          showDialog={showDialog}
          setShowDialog={setShowDialog}
          mana_earned={mana_earned}
          mana_earned_breakdown={mana_earned_breakdown}
        />
      )}
    </>
  )
}
