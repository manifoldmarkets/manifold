import clsx from 'clsx'
import Link from 'next/link'
import {
  ChevronDoubleUpIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/solid'

import { DIVISION_NAMES, getDemotionAndPromotionCountBySeason, league_user_info } from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { toLabel } from 'common/util/adjective-animal'
import { Avatar } from '../widgets/avatar'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { DivisionBadge, DIVISION_STYLES } from './division-badge'

export function UserLeagueCard(props: {
  userRow: league_user_info
  user: { id: string; name: string; username: string; avatarUrl: string }
  season: number
  cohortSize: number
}) {
  const { userRow, user, season, cohortSize } = props
  const { division, cohort, rank, mana_earned } = userRow
  const style = DIVISION_STYLES[division] ?? DIVISION_STYLES[1]

  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCountBySeason(season, division, cohortSize)

  // Calculate zone
  const getZone = () => {
    if (rank <= doublePromotion)
      return { type: 'double-promote', label: 'Double Promote Zone!', icon: ChevronDoubleUpIcon, color: 'text-emerald-400' }
    if (rank <= promotion)
      return { type: 'promote', label: 'Promotion Zone!', icon: ChevronUpIcon, color: 'text-teal-400' }
    if (rank > cohortSize - demotion)
      return { type: 'demote', label: 'Demotion Zone', icon: ChevronDownIcon, color: 'text-rose-400' }
    return { type: 'safe', label: 'Safe Zone', icon: null, color: 'text-ink-500' }
  }

  const zone = getZone()
  const ZoneIcon = zone.icon

  // Calculate progress within the cohort
  const progressPercent = Math.max(0, ((cohortSize - rank + 1) / cohortSize) * 100)

  // Calculate distance to next zone
  const getNextZoneInfo = () => {
    if (zone.type === 'double-promote') return null
    if (zone.type === 'promote') {
      const ranksToDoublePromo = rank - doublePromotion
      return { label: `${ranksToDoublePromo} rank${ranksToDoublePromo > 1 ? 's' : ''} to double promotion`, direction: 'up' }
    }
    if (zone.type === 'safe') {
      const ranksToPromo = rank - promotion
      return { label: `${ranksToPromo} rank${ranksToPromo > 1 ? 's' : ''} to promotion zone`, direction: 'up' }
    }
    // demote zone
    const ranksToDemote = (cohortSize - demotion + 1) - rank
    return { label: `${ranksToDemote} rank${ranksToDemote > 1 ? 's' : ''} until safe`, direction: 'up' }
  }

  const nextZoneInfo = getNextZoneInfo()

  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl border-2 p-4',
        'bg-canvas-50 transition-all duration-300',
        style.border,
        `shadow-lg ${style.glow}`
      )}
    >
      {/* Background gradient */}
      <div
        className={clsx(
          'absolute inset-0 opacity-20',
          `bg-gradient-to-br ${style.gradient}`
        )}
      />

      <Row className="relative z-10 items-center gap-4">
        {/* Division badge */}
        <DivisionBadge division={division} size="lg" showName={false} glow />

        {/* User info */}
        <Col className="flex-1 gap-1">
          <Row className="items-center gap-2">
            <Avatar
              avatarUrl={user.avatarUrl}
              username={user.username}
              size="sm"
              noLink
            />
            <Col>
              <Link
                href={`/${user.username}`}
                className="font-semibold hover:underline"
              >
                {user.name}
              </Link>
              <span className="text-ink-500 text-xs">
                {DIVISION_NAMES[division]} • {toLabel(cohort)}
              </span>
            </Col>
          </Row>
        </Col>

        {/* Rank and earnings */}
        <Col className="items-end gap-1">
          <Row className="items-baseline gap-1">
            <span className="text-3xl font-black">#{rank}</span>
          </Row>
          <span className={clsx('text-sm font-medium', style.text)}>
            {formatMoney(mana_earned)} earned
          </span>
        </Col>
      </Row>

      {/* Progress bar */}
      <div className="relative z-10 mt-4">
        <div className="bg-ink-200 h-2 w-full overflow-hidden rounded-full">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              `bg-gradient-to-r ${style.gradient}`
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <Row className="mt-2 items-center justify-between text-xs">
          <Row className="items-center gap-1">
            {ZoneIcon && <ZoneIcon className={clsx('h-4 w-4', zone.color)} />}
            <span className={zone.color}>{zone.label}</span>
          </Row>
          {nextZoneInfo && (
            <span className="text-ink-500">{nextZoneInfo.label}</span>
          )}
        </Row>
      </div>
    </div>
  )
}

// Simplified rank badge for the table
export function RankBadge(props: {
  rank: number
  rankDiff: number
  isHighlighted?: boolean
}) {
  const { rank, rankDiff, isHighlighted } = props

  const getRankStyle = () => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-500 to-amber-400 text-black'
    if (rank === 2) return 'bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800'
    if (rank === 3) return 'bg-gradient-to-r from-amber-600 to-amber-500 text-white'
    return 'bg-ink-200 text-ink-700'
  }

  return (
    <Row className="items-center gap-1.5">
      {/* Rank change indicator */}
      <div className="w-5">
        {rankDiff < 0 ? (
          <ChevronUpIcon className="h-5 w-5 text-emerald-500" />
        ) : rankDiff > 0 ? (
          <ChevronDownIcon className="h-5 w-5 text-rose-500" />
        ) : null}
      </div>
      {/* Rank number */}
      <div
        className={clsx(
          'flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold',
          getRankStyle(),
          isHighlighted && 'ring-2 ring-primary-500 ring-offset-2'
        )}
      >
        {rank}
      </div>
    </Row>
  )
}
