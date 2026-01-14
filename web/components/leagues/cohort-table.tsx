import clsx from 'clsx'
import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  StarIcon,
} from '@heroicons/react/solid'

import { Fragment, useState } from 'react'
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
import { getRankZoneStyles, DIVISION_STYLES } from './division-badge'
import Link from 'next/link'

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
  const divisionStyle = DIVISION_STYLES[division] ?? DIVISION_STYLES[1]

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

  // Find the highest mana earned for progress bar scaling
  const maxManaEarned = Math.max(...rows.map((r) => r.mana_earned), 1)

  return (
    <Col className="gap-2">
      {division === 1 && (
        <div className="bg-amber-500/10 text-amber-600 mb-2 rounded-lg border border-amber-500/30 px-3 py-2 text-sm">
          💡 Requires 100 mana earned to promote from Bronze
        </div>
      )}

      {/* Zone Legend */}
      {!noPromotionDemotion && (
        <Row className="mb-2 flex-wrap gap-3 text-xs">
          {adjustedDoublePromotionCount > 0 && (
            <Row className="items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-gradient-to-r from-emerald-500 to-teal-500" />
              <span className="text-ink-600">Double promote</span>
            </Row>
          )}
          {adjustedPromotionCount > adjustedDoublePromotionCount && (
            <Row className="items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-gradient-to-r from-teal-500 to-cyan-500" />
              <span className="text-ink-600">Promote</span>
            </Row>
          )}
          {demotionCount > 0 && (
            <Row className="items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-gradient-to-r from-rose-500 to-red-500" />
              <span className="text-ink-600">Demote</span>
            </Row>
          )}
        </Row>
      )}

      <Col className="gap-1">
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
                  maxManaEarned={maxManaEarned}
                  divisionStyle={divisionStyle}
                />
              )}
              {user &&
                shouldTruncateZeros &&
                row.mana_earned === 0 &&
                (i === rows.length - 1 || rows[i + 1].mana_earned !== 0) && (
                  <Row className="text-ink-400 justify-center py-2 text-sm">
                    ···
                  </Row>
                )}
              {!noPromotionDemotion && (
                <>
                  {adjustedDoublePromotionCount > 0 &&
                    i + 1 === adjustedDoublePromotionCount && (
                      <ZoneDivider
                        label={`↑ Promotes to ${nextNextDivisionName}`}
                        color="emerald"
                      />
                    )}
                  {adjustedDoublePromotionCount !== adjustedPromotionCount &&
                    adjustedPromotionCount > 0 &&
                    i + 1 === adjustedPromotionCount && (
                      <ZoneDivider
                        label={`↑ Promotes to ${nextDivisionName}`}
                        color="teal"
                      />
                    )}
                  {demotionCount > 0 &&
                    rows.length - (i + 1) === demotionCount && (
                      <ZoneDivider
                        label={`↓ Demotes to ${prevDivisionName}`}
                        color="rose"
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

function ZoneDivider(props: { label: string; color: 'emerald' | 'teal' | 'rose' }) {
  const { label, color } = props
  const colorClasses = {
    emerald: 'border-emerald-500/50 text-emerald-600 bg-emerald-500/10',
    teal: 'border-teal-500/50 text-teal-600 bg-teal-500/10',
    rose: 'border-rose-500/50 text-rose-600 bg-rose-500/10',
  }

  return (
    <Row className="items-center gap-2 py-2">
      <div className={clsx('h-px flex-1', `border-t-2 border-dashed`, colorClasses[color].split(' ')[0])} />
      <span
        className={clsx(
          'shrink-0 rounded-full px-3 py-1 text-xs font-medium',
          colorClasses[color]
        )}
      >
        {label}
      </span>
      <div className={clsx('h-px flex-1', `border-t-2 border-dashed`, colorClasses[color].split(' ')[0])} />
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
  maxManaEarned: number
  divisionStyle: (typeof DIVISION_STYLES)[number]
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
    maxManaEarned,
    divisionStyle,
  } = props

  const [showDialog, setShowDialog] = useState(false)

  const rankDiff = rank_snapshot ? rank - rank_snapshot : 0
  const progressPercent = (mana_earned / maxManaEarned) * 100

  const getRankBadgeStyle = () => {
    if (rank === 1)
      return 'bg-gradient-to-r from-yellow-500 to-amber-400 text-black shadow-lg shadow-yellow-500/30'
    if (rank === 2)
      return 'bg-gradient-to-r from-slate-300 to-slate-100 text-slate-800 shadow-lg shadow-slate-300/30'
    if (rank === 3)
      return 'bg-gradient-to-r from-amber-700 to-amber-500 text-white shadow-lg shadow-amber-500/30'
    return 'bg-ink-100 text-ink-700'
  }

  return (
    <>
      <div
        className={clsx(
          'group relative cursor-pointer overflow-hidden rounded-xl transition-all',
          'hover:bg-canvas-50',
          isHighlighted && 'bg-primary-50 ring-primary-500 ring-2',
          zoneClasses
        )}
        onClick={() => setShowDialog(true)}
      >
        <Row className="items-center gap-3 p-2.5">
          {/* Rank indicator with change */}
          <Row className="w-16 shrink-0 items-center gap-1">
            <Tooltip
              text={
                rankDiff
                  ? `${rankDiff < 0 ? 'Gained' : 'Lost'} ${Math.abs(rankDiff)} rank${Math.abs(rankDiff) > 1 ? 's' : ''} today`
                  : undefined
              }
            >
              <Row className="items-center gap-0.5">
                <div className="w-4">
                  {rankDiff < -1 ? (
                    <ChevronDoubleUpIcon className="h-4 w-4 text-emerald-500" />
                  ) : rankDiff === -1 ? (
                    <ChevronUpIcon className="h-4 w-4 text-emerald-500" />
                  ) : rankDiff === 1 ? (
                    <ChevronDownIcon className="h-4 w-4 text-rose-500" />
                  ) : rankDiff > 1 ? (
                    <ChevronDoubleDownIcon className="h-4 w-4 text-rose-500" />
                  ) : null}
                </div>
                <div
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold',
                    getRankBadgeStyle()
                  )}
                >
                  {rank === 1 && <StarIcon className="absolute -right-1 -top-1 h-3 w-3 text-yellow-300" />}
                  {rank}
                </div>
              </Row>
            </Tooltip>
          </Row>

          {/* User info */}
          <Row className="min-w-0 flex-1 items-center gap-2">
            <Avatar
              avatarUrl={user.avatarUrl}
              username={user.username}
              size="sm"
              noLink
            />
            <Col className="min-w-0 flex-1">
              <Link
                href={`/${user.username}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-medium hover:underline"
              >
                {user.name}
              </Link>
              {/* Mini progress bar */}
              <div className="bg-ink-200 mt-1 h-1 w-full overflow-hidden rounded-full">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    `bg-gradient-to-r ${divisionStyle.gradient}`
                  )}
                  style={{ width: `${Math.max(progressPercent, 2)}%` }}
                />
              </div>
            </Col>
          </Row>

          {/* Mana earned */}
          <Col className="shrink-0 items-end">
            <span
              className={clsx(
                'font-semibold tabular-nums',
                mana_earned > 0 ? 'text-teal-600' : 'text-ink-500'
              )}
            >
              {mana_earned > 0 ? '+' : ''}
              {formatMoney(mana_earned)}
            </span>
            <span className="text-ink-400 text-xs">earned</span>
          </Col>
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
