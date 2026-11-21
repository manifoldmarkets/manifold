import { useState } from 'react'
import clsx from 'clsx'
import { findLastIndex } from 'lodash'
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/solid'

import {
  type ComputedTrophyProgress,
  type TrophyDefinition,
  type TrophyMilestone,
  formatTrophyValue,
  isMilestoneReached,
} from 'common/trophies'
import { roundTierBonus } from 'common/supporter-config'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { TROPHY_TIER_STYLES } from 'web/components/trophies/trophy-styles'

export function TrophyGrid(props: {
  progressList: ComputedTrophyProgress[]
  definitions: TrophyDefinition[]
  claimedIdsByTrophy: Map<string, Set<string>>
  // Milestones whose reward has been paid, by trophy.
  rewardedIdsByTrophy?: Map<string, Set<string>>
  isOwnProfile?: boolean
  // The viewer's reward multiplier, to show what a milestone pays them. Set
  // only for the owner of a new account.
  rewardMultiplier?: number
  onClaim?: (trophyId: string, milestoneId: string) => void
  claimingId?: string | null
  justClaimedId?: string | null
  onPinToProfile?: (trophyId: string) => void
}) {
  const {
    progressList,
    definitions,
    claimedIdsByTrophy,
    rewardedIdsByTrophy,
    isOwnProfile,
    rewardMultiplier,
    onClaim,
    claimingId,
    justClaimedId,
    onPinToProfile,
  } = props
  const progressMap = new Map(progressList.map((p) => [p.trophyId, p]))

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {definitions.map((def) => {
        const progress = progressMap.get(def.id)
        if (!progress) return null
        return (
          <TrophyCard
            key={def.id}
            definition={def}
            progress={progress}
            claimedIds={claimedIdsByTrophy.get(def.id) ?? EMPTY_SET}
            rewardedIds={rewardedIdsByTrophy?.get(def.id) ?? EMPTY_SET}
            isOwnProfile={isOwnProfile}
            rewardMultiplier={rewardMultiplier}
            onClaim={onClaim}
            claiming={claimingId === def.id}
            justClaimed={justClaimedId === def.id}
            onPinToProfile={onPinToProfile}
          />
        )
      })}
    </div>
  )
}

const EMPTY_SET: Set<string> = new Set()

export function TrophyCard(props: {
  definition: TrophyDefinition
  progress: ComputedTrophyProgress
  claimedIds: Set<string>
  rewardedIds: Set<string>
  isOwnProfile?: boolean
  rewardMultiplier?: number
  onClaim?: (trophyId: string, milestoneId: string) => void
  claiming?: boolean
  justClaimed?: boolean
  onPinToProfile?: (trophyId: string) => void
}) {
  const {
    definition,
    progress,
    claimedIds,
    rewardedIds,
    isOwnProfile,
    rewardMultiplier,
    onClaim,
    claiming,
    justClaimed,
    onPinToProfile,
  } = props
  const { milestones } = definition
  const { currentValue, highestMilestone } = progress

  // The owner sees the milestones they have reached; a visitor sees only the
  // ones the owner claimed.
  const isEarned = (m: TrophyMilestone) =>
    isOwnProfile ? isMilestoneReached(m, currentValue) : claimedIds.has(m.id)
  const startIdx = isOwnProfile
    ? highestMilestone
      ? milestones.findIndex((m) => m.id === highestMilestone.id)
      : -1
    : findLastIndex(milestones, (m) => claimedIds.has(m.id))
  // Start on the highest milestone earned, or the first one.
  const [viewingIdx, setViewingIdx] = useState(Math.max(startIdx, 0))

  const viewing = milestones[viewingIdx]
  if (!viewing) return null

  const isReached = isMilestoneReached(viewing, currentValue)
  const isClaimed = claimedIds.has(viewing.id)
  const earned = isEarned(viewing)
  // What claiming pays this viewer, after their tier multiplier. Zero, so
  // hidden, for an account that would be paid nothing.
  const rewardAmount =
    rewardMultiplier !== undefined && viewing.rewardMana
      ? roundTierBonus(viewing.rewardMana * rewardMultiplier)
      : 0
  // Not paid yet: before claiming, or claimed while the account's
  // multiplier was zero (claiming again pays it).
  const unpaidReward = rewardAmount > 0 && !rewardedIds.has(viewing.id)
  const style = TROPHY_TIER_STYLES[viewing.tier]
  const canGoLeft = viewingIdx > 0
  const canGoRight = viewingIdx < milestones.length - 1
  const progressPct =
    viewing.threshold > 0 ? Math.min(currentValue / viewing.threshold, 1) : 1

  return (
    <Col className="bg-canvas-0 relative overflow-hidden rounded-2xl">
      <div className="relative">
        <div className="flex items-center justify-center px-6 pb-2 pt-5">
          <div
            className={clsx(
              'flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br transition-all',
              style.gradient,
              earned ? style.glow : 'opacity-40 grayscale'
            )}
          >
            <span className="text-5xl" aria-hidden>
              {viewing.emoji}
            </span>
          </div>
        </div>

        <button
          className={clsx(
            'absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors',
            canGoLeft
              ? 'text-ink-500 hover:text-ink-700 hover:bg-ink-100'
              : 'text-ink-300 cursor-default'
          )}
          onClick={() => canGoLeft && setViewingIdx(viewingIdx - 1)}
          disabled={!canGoLeft}
          aria-label="Previous milestone"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button
          className={clsx(
            'absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors',
            canGoRight
              ? 'text-ink-500 hover:text-ink-700 hover:bg-ink-100'
              : 'text-ink-300 cursor-default'
          )}
          onClick={() => canGoRight && setViewingIdx(viewingIdx + 1)}
          disabled={!canGoRight}
          aria-label="Next milestone"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      <Col className="items-center gap-1.5 px-3 pb-3 pt-1">
        <span
          className={clsx(
            'text-base font-bold',
            earned ? style.textColor : 'text-ink-400'
          )}
        >
          {viewing.name}
        </span>

        <span className="text-ink-500 text-center text-xs">
          {definition.label}
          {' · '}
          {formatStat(definition, currentValue)}
        </span>

        {unpaidReward && !isClaimed && (
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
            Pays {formatMoney(rewardAmount)}
          </span>
        )}

        <MilestoneDots
          milestones={milestones}
          isEarned={isEarned}
          viewingIndex={viewingIdx}
          onSelect={setViewingIdx}
        />

        <div className="bg-ink-200 h-1 w-full overflow-hidden rounded-full">
          <div
            className={clsx(
              'h-full rounded-full bg-gradient-to-r transition-all',
              style.gradient
            )}
            style={{
              width: `${progressPct * 100}%`,
              opacity: earned ? 1 : 0.4,
            }}
          />
        </div>

        {isOwnProfile && isReached && !isClaimed && onClaim ? (
          <button
            className={clsx(
              'mt-1 w-full rounded-lg bg-gradient-to-r py-1.5 text-xs font-semibold transition-all',
              claiming ? 'cursor-wait opacity-75' : 'hover:brightness-110',
              style.gradient,
              style.buttonText
            )}
            onClick={() => onClaim(definition.id, viewing.id)}
            disabled={claiming}
          >
            {claiming ? 'Claiming...' : `Claim ${viewing.name}`}
          </button>
        ) : isClaimed ? (
          justClaimed && onPinToProfile ? (
            <button
              className={clsx(
                'mt-1 w-full rounded-lg bg-gradient-to-r py-1.5 text-xs font-semibold transition-all hover:brightness-110',
                style.gradient,
                style.buttonText
              )}
              onClick={() => onPinToProfile(definition.id)}
            >
              Pin to profile
            </button>
          ) : isOwnProfile && unpaidReward && onClaim ? (
            <button
              className={clsx(
                'mt-1 w-full rounded-lg bg-gradient-to-r py-1.5 text-xs font-semibold transition-all',
                claiming ? 'cursor-wait opacity-75' : 'hover:brightness-110',
                style.gradient,
                style.buttonText
              )}
              onClick={() => onClaim(definition.id, viewing.id)}
              disabled={claiming}
            >
              {claiming
                ? 'Collecting...'
                : `Collect ${formatMoney(rewardAmount)}`}
            </button>
          ) : (
            <Row className="mt-0.5 items-center gap-1 text-[11px]">
              <CheckCircleIcon
                className={clsx('h-3.5 w-3.5', style.textColor)}
              />
              <span className={clsx('font-medium', style.textColor)}>
                Claimed
              </span>
            </Row>
          )
        ) : isReached ? (
          <span className="text-ink-400 text-[11px]">
            {isOwnProfile ? 'Reached' : 'Not claimed yet'}
          </span>
        ) : (
          <span className="text-ink-400 text-center text-[11px]">
            {formatRemaining(definition, viewing.threshold - currentValue)} to
            go
          </span>
        )}
      </Col>
    </Col>
  )
}

function MilestoneDots(props: {
  milestones: TrophyMilestone[]
  isEarned: (m: TrophyMilestone) => boolean
  viewingIndex: number
  onSelect: (index: number) => void
}) {
  const { milestones, isEarned, viewingIndex, onSelect } = props

  return (
    <Row className="flex-wrap items-center justify-center gap-1.5">
      {milestones.map((m, i) => {
        const reached = isEarned(m)
        const style = TROPHY_TIER_STYLES[m.tier]
        return (
          <Tooltip key={m.id} text={m.name}>
            <button
              className={clsx(
                'rounded-full transition-all',
                i === viewingIndex ? 'h-3 w-3' : 'h-2 w-2',
                reached ? `bg-gradient-to-br ${style.gradient}` : 'bg-ink-300'
              )}
              onClick={() => onSelect(i)}
              aria-label={m.name}
            />
          </Tooltip>
        )
      })}
    </Row>
  )
}

const DAYS_PER_YEAR = 365

function formatStat(def: TrophyDefinition, value: number) {
  if (def.unit === 'years') {
    return `${Math.round(value * DAYS_PER_YEAR).toLocaleString()} days`
  }
  if (def.formatPrefix) return formatTrophyValue(def, value)
  return `${formatTrophyValue(def, value)} ${def.unit}`
}

function formatRemaining(def: TrophyDefinition, remaining: number) {
  const value = Math.max(remaining, 0)
  if (def.unit === 'years') {
    return `${Math.ceil(value * DAYS_PER_YEAR).toLocaleString()} days`
  }
  return formatTrophyValue(def, value)
}
