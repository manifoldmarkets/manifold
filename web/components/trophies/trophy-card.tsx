import { useEffect, useState } from 'react'
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
  type TrophyMilestoneRef,
  type TrophyRank,
  type TrophyRankPeak,
  type TrophyRankTier,
  MAX_TROPHY_RANK,
  formatLeagueRemaining,
  formatNetWorthPeak,
  getPeakRankTier,
  getTopMilestone,
  getTrophyRankTier,
  getTrophyRankTitle,
  formatTrophyValue,
  getAccountAnniversaryTime,
  getTrophyBadgeImagePath,
  getTrophyClaimReward,
  isMilestoneReached,
} from 'common/trophies'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import { TrophyBadgeImage } from 'web/components/trophies/trophy-badge-image'
import { TrophyRankChip, TrophyRankRing, formatRankValue } from './trophy-rank'
import { TrophyRewardChip, formatTrophyReward } from './trophy-reward-chip'
import { TROPHY_TIER_STYLES } from 'web/components/trophies/trophy-styles'
import { useIsVisible } from 'web/hooks/use-is-visible'

export function TrophyGrid(props: {
  progressList: ComputedTrophyProgress[]
  definitions: TrophyDefinition[]
  ranks: TrophyRank[]
  rankPeaks: TrophyRankPeak[]
  ranksComputedTime: number | null
  claimedIdsByTrophy: Map<string, Set<string>>
  rewarded: TrophyMilestoneRef[]
  isOwnProfile?: boolean
  // The viewer's reward multiplier, to show what a milestone pays them. Set
  // only for the owner of a new account.
  rewardMultiplier?: number
  onClaim?: (trophyId: string, milestoneId: string) => void
  claimingId?: string | null
  justClaimedId?: string | null
  onPinToProfile?: (trophyId: string) => void
  // For an exact Account Age countdown.
  accountCreatedTime?: number
}) {
  const {
    progressList,
    definitions,
    claimedIdsByTrophy,
    rewarded,
    isOwnProfile,
    rewardMultiplier,
    onClaim,
    claimingId,
    justClaimedId,
    onPinToProfile,
    accountCreatedTime,
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
            rank={props.ranks.find((r) => r.trophyId === def.id)}
            peakTier={getPeakRankTier(props.rankPeaks, def.id)}
            ranksComputedTime={props.ranksComputedTime}
            claimedIds={claimedIdsByTrophy.get(def.id) ?? EMPTY_SET}
            rewarded={rewarded}
            isOwnProfile={isOwnProfile}
            rewardMultiplier={rewardMultiplier}
            onClaim={onClaim}
            claimingId={claimingId}
            justClaimed={justClaimedId === def.id}
            onPinToProfile={onPinToProfile}
            accountCreatedTime={accountCreatedTime}
          />
        )
      })}
    </div>
  )
}

const EMPTY_SET: Set<string> = new Set()

export function TrophyCard(props: {
  definition: TrophyDefinition
  rank?: TrophyRank
  peakTier: TrophyRankTier | null
  ranksComputedTime: number | null
  progress: ComputedTrophyProgress
  claimedIds: Set<string>
  rewarded: TrophyMilestoneRef[]
  isOwnProfile?: boolean
  rewardMultiplier?: number
  onClaim?: (trophyId: string, milestoneId: string) => void
  claimingId?: string | null
  justClaimed?: boolean
  onPinToProfile?: (trophyId: string) => void
  accountCreatedTime?: number
}) {
  const {
    definition,
    rank,
    peakTier,
    ranksComputedTime,
    progress,
    claimedIds,
    rewarded,
    isOwnProfile,
    rewardMultiplier,
    onClaim,
    claimingId,
    justClaimed,
    onPinToProfile,
    accountCreatedTime,
  } = props
  const { milestones } = definition
  const claiming = claimingId === definition.id
  const { currentValue, highestMilestone } = progress

  // The owner sees every milestone and which they have reached; a visitor
  // sees only the ones the owner claimed.
  const shown = isOwnProfile
    ? milestones
    : milestones.filter((m) => claimedIds.has(m.id))
  // A claim stays earned even if the stat drops back below it.
  const isEarned = (m: TrophyMilestone) =>
    claimedIds.has(m.id) ||
    (!!isOwnProfile && isMilestoneReached(m, currentValue))
  const startIdx = Math.max(
    highestMilestone
      ? shown.findIndex((m) => m.id === highestMilestone.id)
      : -1,
    findLastIndex(shown, (m) => claimedIds.has(m.id))
  )
  // Start on the highest milestone earned, or the first one.
  const [selectedIdx, setViewingIdx] = useState(Math.max(startIdx, 0))
  // Claims can be removed (admin unclaim) while the card is showing.
  const viewingIdx = Math.min(selectedIdx, shown.length - 1)

  const heldTier = getTrophyRankTier(rank?.rank)
  // A visitor can see a nightly title even before the owner claims a milestone.
  const rankOnly = !shown.length && (heldTier || peakTier)
  const viewing =
    shown[viewingIdx] ?? (rankOnly ? getTopMilestone(definition) : undefined)
  const [hasBeenVisible, setHasBeenVisible] = useState(false)
  const { ref } = useIsVisible(
    () => setHasBeenVisible(true),
    true,
    !!viewing && typeof IntersectionObserver !== 'undefined'
  )
  const previousId = shown[viewingIdx - 1]?.id
  const nextId = shown[viewingIdx + 1]?.id
  // Warm the neighboring badges so stepping through milestones doesn't show
  // an empty circle while the next badge loads.
  useEffect(() => {
    if (!hasBeenVisible) return
    for (const id of [previousId, nextId]) {
      if (id !== undefined)
        new Image().src = getTrophyBadgeImagePath(definition.id, id)
    }
  }, [hasBeenVisible, definition.id, previousId, nextId])

  if (!viewing) return null

  const peak = formatNetWorthPeak(definition, currentValue, rank?.value)
  const isReached = isMilestoneReached(viewing, currentValue)
  const isClaimed = claimedIds.has(viewing.id)
  const earned = isEarned(viewing)
  const rewardAmount = getTrophyClaimReward(
    definition,
    viewing,
    rewarded,
    rewardMultiplier ?? 0
  )
  const unpaidReward = rewardAmount > 0
  const style = TROPHY_TIER_STYLES[viewing.tier]
  const canGoLeft = viewingIdx > 0
  const canGoRight = viewingIdx < shown.length - 1
  const progressPct =
    viewing.threshold > 0 ? Math.min(currentValue / viewing.threshold, 1) : 1

  const badge = (
    <TrophyRankRing tier={heldTier}>
      <span
        className={clsx(
          'flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br transition-all',
          style.gradient,
          earned || rankOnly ? style.glow : 'opacity-40 grayscale'
        )}
      >
        <TrophyBadgeImage
          trophyId={definition.id}
          milestone={viewing}
          className="h-24 w-24"
          emojiClassName="text-5xl"
        />
      </span>
    </TrophyRankRing>
  )
  const rankLabel =
    heldTier && rank ? (
      <TrophyRankChip
        hideScore
        definition={definition}
        tier={heldTier}
        rank={rank.rank}
        value={rank.value}
        computedTime={ranksComputedTime}
      />
    ) : peakTier ? (
      <span className="text-ink-500 text-xs">
        Peak: {getTrophyRankTitle(definition, peakTier)}
      </span>
    ) : null
  if (rankOnly)
    return (
      <Col className="bg-canvas-0 items-center gap-2 rounded-2xl px-3 pb-3 pt-5">
        {badge}
        {rankLabel}
        <span className="text-ink-500 text-center text-xs">
          {definition.label}
          {peak && ` · ${peak}`}
        </span>
      </Col>
    )

  return (
    <Col ref={ref} className="bg-canvas-0 relative overflow-hidden rounded-2xl">
      <div className="relative">
        <div className="flex items-center justify-center px-6 pb-2 pt-5">
          {badge}
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
        {rankLabel}
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
          {peak ?? formatStat(definition, currentValue, accountCreatedTime)}
        </span>

        {!isClaimed && <TrophyRewardChip amount={rewardAmount} />}

        <MilestoneDots
          milestones={shown}
          isEarned={isEarned}
          viewingIndex={viewingIdx}
          onSelect={setViewingIdx}
        />

        {definition.ranked && isOwnProfile && !heldTier && !peakTier && (
          <span className="text-ink-500 text-center text-[11px]">
            Top {MAX_TROPHY_RANK} with at least{' '}
            {formatRankValue(definition, getTopMilestone(definition).threshold)}
            : {getTrophyRankTitle(definition, 'super')}
          </span>
        )}

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
              claimingId ? 'cursor-wait opacity-75' : 'hover:brightness-110',
              style.gradient,
              style.buttonText
            )}
            onClick={() => onClaim(definition.id, viewing.id)}
            disabled={!!claimingId}
          >
            {claiming ? 'Claiming...' : `Claim ${viewing.name}`}
          </button>
        ) : isClaimed ? (
          // An unpaid reward comes first, even right after a claim.
          isOwnProfile && unpaidReward && onClaim ? (
            <button
              className={clsx(
                'mt-1 w-full rounded-lg bg-gradient-to-r py-1.5 text-xs font-semibold transition-all',
                claimingId ? 'cursor-wait opacity-75' : 'hover:brightness-110',
                style.gradient,
                style.buttonText
              )}
              onClick={() => onClaim(definition.id, viewing.id)}
              disabled={!!claimingId}
            >
              {claiming
                ? 'Collecting...'
                : `Collect ${formatTrophyReward(rewardAmount)}`}
            </button>
          ) : justClaimed && onPinToProfile ? (
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
            {formatRemaining(
              definition,
              currentValue,
              viewing.threshold,
              accountCreatedTime &&
                getAccountAnniversaryTime(accountCreatedTime, viewing.threshold)
            )}
            {definition.unit !== 'league' && ' to go'}
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
const DAY_MS = 24 * 60 * 60 * 1000

const days = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'day' : 'days'}`

// Account age is shown in days. With the signup time, counted exactly;
// otherwise from the years value, rounded down.
function formatStat(
  def: TrophyDefinition,
  value: number,
  accountCreatedTime?: number
) {
  if (def.unit === 'years') {
    return days(
      accountCreatedTime
        ? Math.floor((Date.now() - accountCreatedTime) / DAY_MS)
        : Math.floor(value * DAYS_PER_YEAR)
    )
  }
  if (def.formatPrefix || def.unit === 'league')
    return formatTrophyValue(def, value)
  return `${formatTrophyValue(def, value)} ${def.unit}`
}

// Days left until the anniversary when given, so the countdown is exact.
function formatRemaining(
  def: TrophyDefinition,
  current: number,
  target: number,
  anniversaryTime?: number
) {
  if (def.unit === 'league') return formatLeagueRemaining(current, target)
  const value = Math.max(target - current, 0)
  if (def.unit === 'years') {
    return days(
      anniversaryTime
        ? Math.max(1, Math.ceil((anniversaryTime - Date.now()) / DAY_MS))
        : Math.ceil(value * DAYS_PER_YEAR)
    )
  }
  return formatTrophyValue(def, value, 'up')
}
