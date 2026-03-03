import { useState } from 'react'
import clsx from 'clsx'
import {
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
  getProgressFraction,
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
}) {
  const { definition, progress } = props
  const { milestones } = definition
  const { currentValue, highestMilestone } = progress

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
  const fraction = getProgressFraction(definition, currentValue, highestMilestone)
  const isMaxed = !nextMilestone

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

      <Col className="gap-3 p-4">
        {/* Header: arrows + milestone name + emoji */}
        <Row className="items-center justify-between">
          <button
            className={clsx(
              'rounded-full p-1 transition-colors',
              canGoLeft
                ? 'hover:bg-ink-200 text-ink-600'
                : 'text-ink-300 cursor-default'
            )}
            onClick={() => canGoLeft && setViewingIdx(viewingIdx - 1)}
            disabled={!canGoLeft}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>

          <Col className="items-center gap-0.5">
            <span className="text-2xl">{viewing.emoji}</span>
            <span
              className={clsx(
                'text-base font-bold',
                isReached ? style.textColor : 'text-ink-400'
              )}
            >
              {viewing.name}
            </span>
            <span className="text-ink-500 text-xs">
              {formatTrophyValue(definition, viewing.threshold)} {definition.unit}
            </span>
          </Col>

          <button
            className={clsx(
              'rounded-full p-1 transition-colors',
              canGoRight
                ? 'hover:bg-ink-200 text-ink-600'
                : 'text-ink-300 cursor-default'
            )}
            onClick={() => canGoRight && setViewingIdx(viewingIdx + 1)}
            disabled={!canGoRight}
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </Row>

        {/* Dot navigation */}
        <MilestoneDots
          milestones={milestones}
          highestMilestone={highestMilestone}
          viewingIndex={viewingIdx}
          onSelect={setViewingIdx}
        />

        {/* Progress section */}
        <Col className="gap-1.5">
          {isReached ? (
            <>
              <Row className="items-baseline justify-between">
                <span className="text-ink-700 text-sm font-medium">
                  {formatTrophyValue(definition, currentValue)} {definition.unit}
                </span>
                {nextMilestone && (
                  <span className="text-ink-500 text-xs">
                    {formatTrophyValue(definition, nextMilestone.threshold)} for{' '}
                    {nextMilestone.name}
                  </span>
                )}
                {isMaxed && (
                  <span className="text-xs font-medium text-amber-500">
                    Max reached!
                  </span>
                )}
              </Row>
              {nextMilestone && (
                <div className="bg-ink-200 h-2 w-full overflow-hidden rounded-full">
                  <div
                    className={clsx(
                      'h-full rounded-full bg-gradient-to-r transition-all',
                      TROPHY_TIER_STYLES[nextMilestone.tier].gradient
                    )}
                    style={{ width: `${fraction * 100}%` }}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <Row className="items-baseline justify-between">
                <span className="text-ink-500 text-sm">
                  {formatTrophyValue(definition, currentValue)} /{' '}
                  {formatTrophyValue(definition, viewing.threshold)}{' '}
                  {definition.unit}
                </span>
              </Row>
              <div className="bg-ink-200 h-2 w-full overflow-hidden rounded-full">
                <div
                  className={clsx(
                    'h-full rounded-full bg-gradient-to-r transition-all',
                    style.gradient
                  )}
                  style={{
                    width: `${Math.min((currentValue / viewing.threshold) * 100, 100)}%`,
                    opacity: 0.5,
                  }}
                />
              </div>
              <span className="text-ink-400 text-xs">
                {formatTrophyValue(
                  definition,
                  viewing.threshold - currentValue
                )}{' '}
                more to unlock {viewing.name}
              </span>
            </>
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
}) {
  const { progressList, definitions } = props
  const progressMap = new Map(progressList.map((p) => [p.trophyId, p]))

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {definitions.map((def) => {
        const progress = progressMap.get(def.id)
        if (!progress) return null
        return <TrophyCard key={def.id} definition={def} progress={progress} />
      })}
    </div>
  )
}
