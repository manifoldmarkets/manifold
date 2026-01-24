import clsx from 'clsx'
import Link from 'next/link'
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/solid'

import {
  DIVISION_NAMES,
  getDemotionAndPromotionCountBySeason,
  league_user_info,
} from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { toLabel } from 'common/util/adjective-animal'
import { Avatar } from '../widgets/avatar'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { DivisionBadge } from './division-badge'

export function UserLeagueCard(props: {
  userRow: league_user_info
  user: { id: string; name: string; username: string; avatarUrl: string }
  season: number
  cohortSize: number
}) {
  const { userRow, user, season, cohortSize } = props
  const { division, cohort, rank, mana_earned } = userRow

  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCountBySeason(season, division, cohortSize)

  const getZone = () => {
    if (rank <= doublePromotion)
      return {
        type: 'double-promote',
        label: 'Double promotion',
        color: 'text-teal-600',
      }
    if (rank <= promotion)
      return {
        type: 'promote',
        label: 'Promotion zone',
        color: 'text-teal-600',
      }
    if (rank > cohortSize - demotion)
      return {
        type: 'demote',
        label: 'Demotion zone',
        color: 'text-scarlet-600',
      }
    return { type: 'safe', label: 'Safe', color: 'text-ink-500' }
  }

  const zone = getZone()

  return (
    <div className="bg-canvas-0 border-ink-200 rounded-lg border p-4">
      <Row className="items-center gap-4">
        <DivisionBadge division={division} size="lg" showName={false} />

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
                className="text-ink-900 font-medium hover:underline"
              >
                {user.name}
              </Link>
              <span className="text-ink-500 text-xs">
                {DIVISION_NAMES[division]} · {toLabel(cohort)}
              </span>
            </Col>
          </Row>
        </Col>

        <Col className="items-end gap-0.5">
          <span className="text-ink-900 text-xl font-semibold">#{rank}</span>
          <span className="text-sm font-medium text-teal-600">
            {formatMoney(mana_earned)}
          </span>
        </Col>
      </Row>

      <Row className="border-ink-100 mt-3 items-center justify-between border-t pt-3 text-sm">
        <span className={zone.color}>{zone.label}</span>
        <span className="text-ink-500">{cohortSize} in group</span>
      </Row>
    </div>
  )
}

export function RankBadge(props: {
  rank: number
  rankDiff: number
  isHighlighted?: boolean
}) {
  const { rank, rankDiff, isHighlighted } = props

  return (
    <Row className="items-center gap-1">
      <div className="w-4">
        {rankDiff < 0 ? (
          <ChevronUpIcon className="h-4 w-4 text-teal-500" />
        ) : rankDiff > 0 ? (
          <ChevronDownIcon className="text-scarlet-500 h-4 w-4" />
        ) : null}
      </div>
      <span
        className={clsx(
          'text-sm font-medium tabular-nums',
          rank <= 3 ? 'text-ink-900' : 'text-ink-600',
          isHighlighted && 'text-primary-700'
        )}
      >
        {rank}
      </span>
    </Row>
  )
}
