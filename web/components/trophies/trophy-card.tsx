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
  getTrophyBadgeUrl,
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

  const badgeUrl = getTrophyBadgeUrl(definition.id, viewing.name)
  const [imgError, setImgError] = useState<Record<string, boolean>>({})
  const hasBadgeImage = !imgError[badgeUrl]

  // Progress toward the viewed milestone (0-1)
  const progressPct = Math.min(currentValue / viewing.threshold, 1)

  return (
    <Col
      className={clsx(
        'relative overflow-hidden rounded-2xl transition-all',
        isReached
          ? 'bg-canvas-0 dark:bg-canvas-0'
          : 'bg-canvas-0 dark:bg-canvas-0'
      )}
    >
      {/* Art-centric layout: large image dominates */}
      <div className="relative">
        {/* Background: the badge image or emoji, full-width */}
        {hasBadgeImage ? (
          <div className="flex items-center justify-center px-6 pt-5 pb-2">
            <div
              className={clsx(
                'rounded-full bg-gradient-to-br transition-all',
                style.gradient,
                style.ringWidth,
                isReached ? style.glow : 'opacity-40 grayscale'
              )}
            >
              <img
                src={badgeUrl}
                alt={viewing.name}
                className={clsx(
                  'h-28 w-28 rounded-full object-cover brightness-125 contrast-110 dark:brightness-100 dark:contrast-100',
                  !isReached && 'grayscale opacity-60'
                )}
                onError={() =>
                  setImgError((prev) => ({ ...prev, [badgeUrl]: true }))
                }
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center px-6 pt-5 pb-2">
            <div
              className={clsx(
                'flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br',
                style.gradient,
                isReached ? style.glow : 'opacity-40 grayscale'
              )}
            >
              <span className="text-5xl">{viewing.emoji}</span>
            </div>
          </div>
        )}

        {/* Navigation arrows — positioned over the image area */}
        <button
          className={clsx(
            'absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors',
            canGoLeft
              ? 'text-ink-500 hover:text-ink-700 hover:bg-ink-100 dark:hover:bg-ink-700'
              : 'text-ink-300 dark:text-ink-600 cursor-default'
          )}
          onClick={() => canGoLeft && setViewingIdx(viewingIdx - 1)}
          disabled={!canGoLeft}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button
          className={clsx(
            'absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition-colors',
            canGoRight
              ? 'text-ink-500 hover:text-ink-700 hover:bg-ink-100 dark:hover:bg-ink-700'
              : 'text-ink-300 dark:text-ink-600 cursor-default'
          )}
          onClick={() => canGoRight && setViewingIdx(viewingIdx + 1)}
          disabled={!canGoRight}
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Info section below the art */}
      <Col className="items-center gap-1.5 px-3 pb-3 pt-1">
        {/* Name */}
        <span
          className={clsx(
            'text-base font-bold',
            isReached ? style.textColor : 'text-ink-400'
          )}
        >
          {viewing.name}
        </span>

        {/* Category label + stat */}
        <span className="text-ink-500 text-xs">
          {definition.label}
          {' \u00B7 '}
          {definition.unit === 'years'
            ? `${Math.round(currentValue * 365)} days`
            : `${formatTrophyValue(definition, currentValue)} ${definition.unit}`}
        </span>

        {/* Dot navigation */}
        <MilestoneDots
          milestones={milestones}
          highestMilestone={highestMilestone}
          viewingIndex={viewingIdx}
          onSelect={setViewingIdx}
        />

        {/* Thin progress bar */}
        <div className="bg-ink-200 dark:bg-ink-700 h-1 w-full overflow-hidden rounded-full">
          <div
            className={clsx(
              'h-full rounded-full bg-gradient-to-r transition-all',
              style.gradient
            )}
            style={{
              width: `${progressPct * 100}%`,
              opacity: isReached ? 1 : 0.4,
            }}
          />
        </div>

        {/* Next milestone hint OR claim button */}
        {isOwnProfile && isReached && viewingIdx > claimedIdx && onClaim ? (
          <button
            className={clsx(
              'mt-1 w-full rounded-lg py-1.5 text-xs font-semibold text-white transition-all',
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
        ) : isReached && viewingIdx <= claimedIdx ? (
          justClaimed && onPinToProfile ? (
            <button
              className={clsx(
                'mt-1 w-full rounded-lg py-1.5 text-xs font-semibold text-white transition-all',
                'bg-gradient-to-r hover:brightness-110',
                style.gradient
              )}
              onClick={() => onPinToProfile(definition.id)}
            >
              Pin to Profile
            </button>
          ) : (
            <Row className="mt-0.5 items-center gap-1 text-[11px]">
              <CheckCircleIcon className={clsx('h-3.5 w-3.5', style.textColor)} />
              <span className={clsx('font-medium', style.textColor)}>Claimed</span>
            </Row>
          )
        ) : nextMilestone ? (
          <span className="text-ink-400 text-[11px]">
            {definition.unit === 'years'
              ? `${Math.round((nextMilestone.threshold - currentValue) * 365)} days`
              : formatTrophyValue(definition, nextMilestone.threshold - currentValue)}{' '}more for{' '}
            {nextMilestone.name}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-amber-500">
            Max reached!
          </span>
        )}
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
