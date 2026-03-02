import clsx from 'clsx'

// Tailwind safelist: these gradient classes are defined in common/src/trophies.ts
// which is outside Tailwind's content scan path. Listing them here ensures they
// are included in the CSS bundle.
// from-zinc-400 to-zinc-500 text-zinc-500
// from-emerald-400 to-emerald-600 text-emerald-500
// from-sky-400 to-blue-600 text-blue-500
// from-violet-400 to-purple-600 text-violet-500
// from-red-500 to-rose-700 text-red-500
// from-amber-400 to-yellow-600 text-amber-500
// from-pink-400 via-cyan-400 to-yellow-400 text-transparent bg-clip-text bg-gradient-to-r

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  type TrophyDefinition,
  type TrophyTier,
  type UserTrophyProgress,
  TROPHY_TIER_INDEX,
  TROPHY_TIER_STYLES,
  CATEGORY_EMOJI,
  getNextUnclaimedTier,
  getClaimableTiers,
  getProgressFraction,
  formatTrophyValue,
} from 'common/trophies'

// Shared tier dots used by both variants
function TierDots(props: {
  definition: TrophyDefinition
  highestClaimed: TrophyTier | null
  claimable: { tier: TrophyTier }[]
  size?: 'sm' | 'md'
}) {
  const { definition, highestClaimed, claimable, size = 'md' } = props
  const dotSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'

  return (
    <Row className="gap-1.5">
      {definition.tiers.map((tierConfig) => {
        const tierIdx = TROPHY_TIER_INDEX[tierConfig.tier]
        const claimedIdx = highestClaimed
          ? TROPHY_TIER_INDEX[highestClaimed]
          : -1
        const isClaimed = tierIdx <= claimedIdx
        const isClaimable = claimable.some((c) => c.tier === tierConfig.tier)
        const tierStyle = TROPHY_TIER_STYLES[tierConfig.tier]

        return (
          <Tooltip
            key={tierConfig.tier}
            text={`${tierStyle.label}: ${tierConfig.threshold}`}
          >
            <div
              className={clsx(
                dotSize,
                'rounded-full border transition-all',
                isClaimed
                  ? `bg-gradient-to-br ${tierStyle.gradient} border-transparent`
                  : isClaimable
                    ? `bg-gradient-to-br ${tierStyle.gradient} border-transparent`
                    : 'border-ink-300 bg-canvas-50'
              )}
            />
          </Tooltip>
        )
      })}
    </Row>
  )
}

// ---------------------------------------------------------------------------
// Zone 2: Large claim card — used for "Ready to Claim" section
// Supports an inline "just claimed" celebration state.
// ---------------------------------------------------------------------------

export function TrophyClaimCard(props: {
  definition: TrophyDefinition
  progress: UserTrophyProgress
  onClaim: (trophyId: string, tier: TrophyTier) => void
  justClaimedTier?: TrophyTier | null
}) {
  const { definition, progress, onClaim, justClaimedTier } = props
  const { currentValue, highestClaimedTier } = progress
  const emoji = CATEGORY_EMOJI[definition.category]

  // --- "Just Claimed" inline celebration state ---
  if (justClaimedTier) {
    const claimedStyle = TROPHY_TIER_STYLES[justClaimedTier]
    const nextTier = getNextUnclaimedTier(definition.id, justClaimedTier)

    return (
      <div
        className="relative h-full rounded-xl p-[2px]"
        style={{ '--glow-color': tierGlowColor(justClaimedTier) } as React.CSSProperties}
      >
        <div
          className={clsx(
            'h-full rounded-xl bg-gradient-to-br',
            claimedStyle.gradient
          )}
        >
          <Col
            className="trophy-card-shine relative h-full items-center gap-3 rounded-[10px] px-5 py-5"
            style={{ background: `linear-gradient(135deg, ${tierBgTint(justClaimedTier)}, rgb(var(--color-canvas-0)))` } as React.CSSProperties}
          >
            <span className="text-3xl">{emoji}</span>
            <div className="text-ink-900 text-lg font-bold">
              {definition.name}
            </div>
            <div className={clsx('text-lg font-semibold', claimedStyle.textColor)}>
              {claimedStyle.label} Tier
            </div>
            <div className="text-ink-600 text-sm font-medium">Earned!</div>

            <TierDots
              definition={definition}
              highestClaimed={justClaimedTier}
              claimable={[]}
            />

            {/* Next tier preview */}
            {nextTier ? (
              <Col className="bg-canvas-50 w-full gap-1.5 rounded-lg p-3">
                <Row className="items-center justify-between">
                  <span className="text-ink-600 text-xs font-medium uppercase tracking-wider">
                    Next: {TROPHY_TIER_STYLES[nextTier.tier].label}
                  </span>
                  <span className="text-ink-500 text-xs">
                    {formatTrophyValue(definition, currentValue)} /{' '}
                    {formatTrophyValue(definition, nextTier.threshold)}
                  </span>
                </Row>
                <div className="bg-ink-200 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className={clsx(
                      'h-full rounded-full bg-gradient-to-r',
                      TROPHY_TIER_STYLES[nextTier.tier].gradient
                    )}
                    style={{
                      width: `${Math.min((currentValue / nextTier.threshold) * 100, 100)}%`,
                    }}
                  />
                </div>
                <div className="text-ink-700 text-xs">
                  {formatTrophyValue(
                    definition,
                    nextTier.threshold - currentValue
                  )}{' '}
                  more to {TROPHY_TIER_STYLES[nextTier.tier].label}
                </div>
              </Col>
            ) : (
              <div className="text-sm font-medium text-amber-500">
                Maximum tier reached!
              </div>
            )}
          </Col>
        </div>
      </div>
    )
  }

  // --- Normal claimable state ---
  const claimable = getClaimableTiers(
    definition.id,
    currentValue,
    highestClaimedTier
  )
  const claimTier = claimable[0]
  if (!claimTier) return null
  const tierStyle = TROPHY_TIER_STYLES[claimTier.tier]

  return (
    <div
      className="trophy-glow relative h-full rounded-xl p-[2px] transition-shadow hover:shadow-xl"
      style={
        {
          '--glow-color': tierGlowColor(claimTier.tier),
        } as React.CSSProperties
      }
    >
      {/* Steady gradient border (no pulse — uses shadow glow instead) */}
      <div
        className={clsx(
          'h-full rounded-xl bg-gradient-to-br',
          tierStyle.gradient
        )}
      >
        <Col
          className="trophy-card-shine relative h-full items-center gap-3 rounded-[10px] px-5 py-5"
          style={{ background: `linear-gradient(135deg, ${tierBgTint(claimTier.tier)}, rgb(var(--color-canvas-0)))` } as React.CSSProperties}
        >
          <span className="text-3xl">{emoji}</span>
          <div className="text-ink-900 text-lg font-bold">
            {definition.name}
          </div>
          <div className="text-ink-600 text-center text-sm">
            {definition.description}
          </div>

          <div className="text-ink-900 mt-auto text-xl font-semibold">
            {formatTrophyValue(definition, currentValue)}
          </div>

          <TierDots
            definition={definition}
            highestClaimed={highestClaimedTier}
            claimable={claimable}
          />

          <Button
            color="gradient"
            size="md"
            className="mt-1 w-full"
            onClick={() => onClaim(definition.id, claimTier.tier)}
          >
            Claim {tierStyle.label} Tier
          </Button>
        </Col>
      </div>
    </div>
  )
}

/** Returns a CSS color string for the glow shadow animation per tier. */
function tierGlowColor(tier: TrophyTier): string {
  switch (tier) {
    case 'gray':
      return 'rgb(161 161 170)' // zinc-400
    case 'green':
      return 'rgb(52 211 153)' // emerald-400
    case 'blue':
      return 'rgb(56 189 248)' // sky-400
    case 'purple':
      return 'rgb(139 92 246)' // violet-500
    case 'crimson':
      return 'rgb(239 68 68)' // red-500
    case 'gold':
      return 'rgb(251 191 36)' // amber-400
    case 'prismatic':
      return 'rgb(236 72 153)' // pink-500
  }
}

/** Returns a subtle tinted background color for the card interior per tier. */
function tierBgTint(tier: TrophyTier): string {
  switch (tier) {
    case 'gray':
      return 'rgba(161, 161, 170, 0.08)'
    case 'green':
      return 'rgba(52, 211, 153, 0.10)'
    case 'blue':
      return 'rgba(56, 189, 248, 0.10)'
    case 'purple':
      return 'rgba(139, 92, 246, 0.10)'
    case 'crimson':
      return 'rgba(239, 68, 68, 0.10)'
    case 'gold':
      return 'rgba(251, 191, 36, 0.12)'
    case 'prismatic':
      return 'rgba(236, 72, 153, 0.10)'
  }
}

// ---------------------------------------------------------------------------
// Zone 3: Compact "almost there" card
// ---------------------------------------------------------------------------

export function TrophyAlmostCard(props: {
  definition: TrophyDefinition
  progress: UserTrophyProgress
}) {
  const { definition, progress } = props
  const { currentValue, highestClaimedTier } = progress
  const nextTier = getNextUnclaimedTier(definition.id, highestClaimedTier)
  if (!nextTier) return null
  const fraction = getProgressFraction(
    definition,
    currentValue,
    highestClaimedTier
  )
  const remaining = nextTier.threshold - currentValue
  const tierStyle = TROPHY_TIER_STYLES[nextTier.tier]

  return (
    <Col className="border-ink-200 bg-canvas-0 gap-2 rounded-lg border p-3">
      <Row className="items-center justify-between">
        <span className="text-ink-900 text-sm font-semibold">
          {definition.name}
        </span>
        <span className={clsx('text-xs font-medium', tierStyle.textColor)}>
          {tierStyle.label}
        </span>
      </Row>
      <div className="bg-ink-200 h-2 w-full overflow-hidden rounded-full">
        <div
          className={clsx(
            'h-full rounded-full bg-gradient-to-r transition-all',
            tierStyle.gradient
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <div className="text-ink-600 text-xs">
        {formatTrophyValue(definition, remaining)} more to{' '}
        {tierStyle.label}
      </div>
    </Col>
  )
}

// ---------------------------------------------------------------------------
// Zone 4: Full-width list row
// ---------------------------------------------------------------------------

export function TrophyRow(props: {
  definition: TrophyDefinition
  progress: UserTrophyProgress | undefined
  onClaim: (trophyId: string, tier: TrophyTier) => void
  isOwnProfile: boolean
}) {
  const { definition, progress, onClaim, isOwnProfile } = props
  const currentValue = progress?.currentValue ?? 0
  const highestClaimed = progress?.highestClaimedTier ?? null
  const claimable = getClaimableTiers(
    definition.id,
    currentValue,
    highestClaimed
  )
  const nextTier = getNextUnclaimedTier(definition.id, highestClaimed)
  const hasProgress = currentValue > 0
  const fraction = getProgressFraction(definition, currentValue, highestClaimed)
  const emoji = CATEGORY_EMOJI[definition.category]

  return (
    <Col
      className={clsx(
        'border-ink-200 gap-2 rounded-lg border px-4 py-3 transition-shadow hover:shadow-sm',
        !hasProgress && 'opacity-40'
      )}
    >
      <Row className="items-center gap-3">
        {/* Icon */}
        <span className="text-xl">{emoji}</span>

        {/* Name + description */}
        <Col className="min-w-0 flex-1">
          <Row className="items-center gap-2">
            <span className="text-ink-900 text-sm font-semibold">
              {definition.name}
            </span>
            <TierDots
              definition={definition}
              highestClaimed={highestClaimed}
              claimable={claimable}
              size="sm"
            />
          </Row>
          <span className="text-ink-500 truncate text-xs">
            {definition.description}
          </span>
        </Col>

        {/* Value + tier */}
        <Col className="items-end gap-0.5">
          <span className="text-ink-900 text-sm font-medium">
            {formatTrophyValue(definition, currentValue)}
          </span>
          {highestClaimed && (
            <span
              className={clsx(
                'text-xs font-semibold',
                TROPHY_TIER_STYLES[highestClaimed].textColor
              )}
            >
              {TROPHY_TIER_STYLES[highestClaimed].label}
            </span>
          )}
        </Col>

        {/* Inline claim button */}
        {isOwnProfile && claimable.length > 0 && (
          <Button
            color="gradient"
            size="xs"
            onClick={() => onClaim(definition.id, claimable[0].tier)}
          >
            Claim
          </Button>
        )}
      </Row>

      {/* Progress bar */}
      {nextTier && hasProgress && (
        <Row className="items-center gap-2 pl-9">
          <div className="bg-ink-200 h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className={clsx(
                'h-full rounded-full bg-gradient-to-r',
                TROPHY_TIER_STYLES[nextTier.tier].gradient
              )}
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
          <span className="text-ink-500 w-24 text-right text-xs">
            {formatTrophyValue(definition, currentValue)} /{' '}
            {formatTrophyValue(definition, nextTier.threshold)}
          </span>
        </Row>
      )}

      {/* Max tier */}
      {!nextTier && highestClaimed && (
        <div className="pl-9 text-xs font-medium text-amber-500">
          Maximum tier reached
        </div>
      )}
    </Col>
  )
}
