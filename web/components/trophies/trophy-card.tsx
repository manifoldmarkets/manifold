import { useState } from 'react'
import clsx from 'clsx'
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/solid'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  type TrophyDefinition,
  type TrophyMilestone,
  type ComputedTrophyProgress,
  TROPHY_TIER_STYLES,
  getNextMilestone,
  formatTrophyValue,
} from 'common/trophies'

// ---------------------------------------------------------------------------
// Milestone dot indicator
// ---------------------------------------------------------------------------

function MilestoneDots(props: {
  milestones: TrophyMilestone[]
  highestMilestone: TrophyMilestone | null
  viewingIndex: number
  onSelect: (index: number) => void
}) {
  const { milestones, highestMilestone, viewingIndex, onSelect } = props
  const highestIdx = highestMilestone
    ? milestones.indexOf(highestMilestone)
    : -1

  return (
    <Row className="items-center justify-center gap-1.5">
      {milestones.map((m, i) => {
        const reached = i <= highestIdx
        const isViewing = i === viewingIndex
        const style = TROPHY_TIER_STYLES[m.tier]

        return (
          <Tooltip key={m.name} text={m.name}>
            <button
              className={clsx(
                'rounded-full transition-all',
                isViewing ? 'h-3 w-3' : 'h-2 w-2',
                reached
                  ? `bg-gradient-to-br ${style.gradient}`
                  : 'bg-ink-300 dark:bg-ink-500'
              )}
              onClick={() => onSelect(i)}
            />
          </Tooltip>
        )
      })}
    </Row>
  )
}

// ---------------------------------------------------------------------------
// Trophy card with tier navigation
// ---------------------------------------------------------------------------

export function TrophyCard(props: {
  definition: TrophyDefinition
  progress: ComputedTrophyProgress
  claimedMilestone?: string // highest claimed milestone name from server
  isOwnProfile?: boolean
  onClaim?: (trophyId: string, milestone: string) => void
  claiming?: boolean
  justClaimed?: boolean
  onPinToProfile?: (trophyId: string) => void
}) {
  const { definition, progress, claimedMilestone, isOwnProfile, onClaim, claiming, justClaimed, onPinToProfile } = props
  const { milestones } = definition
  const { currentValue, highestMilestone } = progress

  // Claimed index: all milestones at or below this index are considered claimed
  const claimedIdx = claimedMilestone
    ? milestones.findIndex((m) => m.name === claimedMilestone)
    : -1

  const highestIdx = highestMilestone
    ? milestones.indexOf(highestMilestone)
    : -1

  // Default view: the current milestone, or the first one if none reached
  const defaultIdx = highestIdx >= 0 ? highestIdx : 0
  const [viewingIdx, setViewingIdx] = useState(defaultIdx)

  const viewing = milestones[viewingIdx]
  if (!viewing) return null

  const isReached = viewingIdx <= highestIdx
  const style = TROPHY_TIER_STYLES[viewing.tier]
  const canGoLeft = viewingIdx > 0
  const canGoRight = viewingIdx < milestones.length - 1

  // Progress bar: show toward the NEXT milestone after highest reached
  const nextMilestone = getNextMilestone(definition, highestMilestone)

  return (
    <Col
      className={clsx(
        'border-ink-200 relative overflow-hidden rounded-xl border transition-all',
        isReached ? style.bgTint : 'bg-canvas-0'
      )}
    >
      {/* Gradient accent bar at top */}
      <div
        className={clsx(
          'h-1 w-full bg-gradient-to-r',
          isReached ? style.gradient : 'from-ink-200 to-ink-300'
        )}
      />

      <Col className="gap-2 p-3">
        {/* Header: arrows + emoji/milestone + label */}
        <Row className="items-center justify-between">
          <button
            className={clsx(
              'rounded-full p-0.5 transition-colors',
              canGoLeft
                ? 'hover:bg-ink-200 text-ink-600'
                : 'text-ink-300 cursor-default'
            )}
            onClick={() => canGoLeft && setViewingIdx(viewingIdx - 1)}
            disabled={!canGoLeft}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>

          <Col className="items-center gap-0">
            <Row className="items-center gap-1.5">
              <span className="text-lg">{viewing.emoji}</span>
              <span
                className={clsx(
                  'text-sm font-bold',
                  isReached ? style.textColor : 'text-ink-400'
                )}
              >
                {viewing.name}
              </span>
            </Row>
            <span className="text-ink-500 text-[11px]">
              {definition.label}
            </span>
          </Col>

          <button
            className={clsx(
              'rounded-full p-0.5 transition-colors',
              canGoRight
                ? 'hover:bg-ink-200 text-ink-600'
                : 'text-ink-300 cursor-default'
            )}
            onClick={() => canGoRight && setViewingIdx(viewingIdx + 1)}
            disabled={!canGoRight}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </Row>

        {/* Dot navigation */}
        <MilestoneDots
          milestones={milestones}
          highestMilestone={highestMilestone}
          viewingIndex={viewingIdx}
          onSelect={setViewingIdx}
        />

        {/* Progress section — bar is always relative to the VIEWED tier */}
        <Col className="gap-1">
          <Row className="items-baseline justify-between">
            <span className={clsx('text-xs font-medium', isReached ? 'text-ink-700' : 'text-ink-500')}>
              {formatTrophyValue(definition, currentValue)} / {formatTrophyValue(definition, viewing.threshold)}{' '}
              {definition.unit}
            </span>
          </Row>
          <div className="bg-ink-200 h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={clsx(
                'h-full rounded-full bg-gradient-to-r transition-all',
                style.gradient
              )}
              style={{
                width: `${Math.min((currentValue / viewing.threshold) * 100, 100)}%`,
                opacity: isReached ? 1 : 0.5,
              }}
            />
          </div>
          {/* "Next up" hint — always shows the next unearned milestone globally */}
          {nextMilestone ? (
            <span className="text-ink-400 text-[11px]">
              {formatTrophyValue(definition, nextMilestone.threshold - currentValue)} more for{' '}
              {nextMilestone.name}
            </span>
          ) : (
            <span className="text-[11px] font-medium text-amber-500">
              Max reached!
            </span>
          )}

          {/* Per-tier claim button or claimed indicator */}
          {isReached && viewingIdx <= claimedIdx && (
            justClaimed && onPinToProfile ? (
              <button
                className={clsx(
                  'w-full rounded-lg py-1 text-xs font-semibold text-white transition-all',
                  'bg-gradient-to-r hover:brightness-110',
                  style.gradient
                )}
                onClick={() => onPinToProfile(definition.id)}
              >
                Pin to Profile
              </button>
            ) : (
              <Row className="items-center justify-center gap-1 text-[11px]">
                <CheckCircleIcon className={clsx('h-3.5 w-3.5', style.textColor)} />
                <span className={clsx('font-medium', style.textColor)}>Claimed</span>
              </Row>
            )
          )}
          {isOwnProfile &&
            isReached &&
            viewingIdx > claimedIdx &&
            onClaim && (
              <button
                className={clsx(
                  'w-full rounded-lg py-1 text-xs font-semibold text-white transition-all',
                  claiming
                    ? 'cursor-wait bg-gradient-to-r opacity-75'
                    : 'bg-gradient-to-r hover:brightness-110',
                  style.gradient
                )}
                onClick={() => onClaim(definition.id, viewing.name)}
                disabled={claiming}
              >
                {claiming ? 'Claiming...' : `Claim ${viewing.name}`}
              </button>
            )}
        </Col>
      </Col>
    </Col>
  )
}

// ---------------------------------------------------------------------------
// Trophy grid — the full collection view for the Trophies tab
// ---------------------------------------------------------------------------

export function TrophyGrid(props: {
  progressList: ComputedTrophyProgress[]
  definitions: TrophyDefinition[]
  claimedTrophies?: { trophyId: string; milestone: string }[]
  isOwnProfile?: boolean
  onClaim?: (trophyId: string, milestone: string) => void
  claimingId?: string | null
  justClaimedId?: string | null
  onPinToProfile?: (trophyId: string) => void
}) {
  const { progressList, definitions, claimedTrophies, isOwnProfile, onClaim, claimingId, justClaimedId, onPinToProfile } = props
  const progressMap = new Map(progressList.map((p) => [p.trophyId, p]))
  const claimedMap = new Map(
    (claimedTrophies ?? []).map((c) => [c.trophyId, c.milestone])
  )

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {definitions.map((def) => {
        const progress = progressMap.get(def.id)
        if (!progress) return null
        return (
          <TrophyCard
            key={def.id}
            definition={def}
            progress={progress}
            claimedMilestone={claimedMap.get(def.id)}
            isOwnProfile={isOwnProfile}
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
