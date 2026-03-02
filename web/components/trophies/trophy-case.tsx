import { useState } from 'react'
import toast from 'react-hot-toast'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ProgressBar } from 'web/components/progress-bar'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { TrophyClaimCard, TrophyAlmostCard, TrophyRow } from './trophy-card'
import {
  TROPHY_DEFINITIONS,
  type TrophyCategory,
  type TrophyDefinition,
  type TrophyTier,
  type UserTrophyProgress,
  getClaimableTiers,
  getProgressFraction,
  getNextUnclaimedTier,
  countClaimableTiers,
  countClaimedTiers,
  getTotalPossibleTiers,
} from 'common/trophies'

const CATEGORY_LABELS: Record<TrophyCategory, string> = {
  trading: 'Trading',
  creating: 'Creating',
  social: 'Social',
  community: 'Community',
  prestige: 'Prestige',
}

const CATEGORY_ORDER: TrophyCategory[] = [
  'trading',
  'creating',
  'social',
  'community',
  'prestige',
]

export function TrophyCase(props: { userId: string }) {
  const { userId } = props
  const currentUser = useUser()
  const isOwnProfile = currentUser?.id === userId

  const { data, loading, error, refresh } = useAPIGetter(
    'get-trophy-progress',
    { userId }
  )

  // Track which trophies were just claimed (trophyId → tier) for inline celebration
  const [justClaimed, setJustClaimed] = useState<Record<string, TrophyTier>>(
    {}
  )

  if (loading) {
    return (
      <Row className="text-ink-600 items-center gap-2">
        Loading trophies...
      </Row>
    )
  }
  if (error) return <div className="text-error">{error.message}</div>

  const progressList = data?.trophies ?? []
  const progressByTrophyId = new Map<string, UserTrophyProgress>()
  for (const p of progressList) {
    progressByTrophyId.set(p.trophyId, p)
  }

  const claimableCount = countClaimableTiers(progressList)
  const claimedCount = countClaimedTiers(progressList)
  const totalPossible = getTotalPossibleTiers()

  const handleClaim = async (trophyId: string, tier: TrophyTier) => {
    try {
      await api('claim-trophy-tier', { trophyId, tier })
      // Show inline celebration on the card
      setJustClaimed((prev) => ({ ...prev, [trophyId]: tier }))
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  // --- Compute the zones ---

  // Zone 2: Claimable trophies (include just-claimed ones so they stay visible)
  const claimableTrophies: {
    def: TrophyDefinition
    progress: UserTrophyProgress
  }[] = []
  for (const def of TROPHY_DEFINITIONS) {
    const progress = progressByTrophyId.get(def.id)
    if (!progress) continue
    const claimable = getClaimableTiers(
      def.id,
      progress.currentValue,
      progress.highestClaimedTier
    )
    if (claimable.length > 0 || justClaimed[def.id]) {
      claimableTrophies.push({ def, progress })
    }
  }

  // Zone 3: "Almost there" — trophies with >0 progress, not claimable, not maxed out
  // Sorted by highest progress fraction first
  const almostThere: { def: TrophyDefinition; progress: UserTrophyProgress }[] =
    []
  for (const def of TROPHY_DEFINITIONS) {
    const progress = progressByTrophyId.get(def.id)
    if (!progress || progress.currentValue <= 0) continue
    if (justClaimed[def.id]) continue // still showing in Zone 2
    const claimable = getClaimableTiers(
      def.id,
      progress.currentValue,
      progress.highestClaimedTier
    )
    if (claimable.length > 0) continue // already in Zone 2
    const nextTier = getNextUnclaimedTier(
      def.id,
      progress.highestClaimedTier
    )
    if (!nextTier) continue // maxed out
    almostThere.push({ def, progress })
  }
  almostThere.sort((a, b) => {
    const fracA = getProgressFraction(
      a.def,
      a.progress.currentValue,
      a.progress.highestClaimedTier
    )
    const fracB = getProgressFraction(
      b.def,
      b.progress.currentValue,
      b.progress.highestClaimedTier
    )
    return fracB - fracA
  })
  const almostThereTop = almostThere.slice(0, 4)

  // Zone 4: Group all definitions by category
  const byCategory = new Map<TrophyCategory, TrophyDefinition[]>()
  for (const cat of CATEGORY_ORDER) {
    byCategory.set(cat, [])
  }
  for (const def of TROPHY_DEFINITIONS) {
    byCategory.get(def.category)?.push(def)
  }

  return (
    <Col className="gap-8">
      {/* Zone 1: Hero Summary Bar */}
      <Col className="bg-canvas-0 border-ink-200 gap-3 rounded-xl border px-5 py-4">
        <Row className="items-center justify-between">
          <Row className="items-center gap-2">
            <span className="text-2xl">{'\u{1F3C6}'}</span>
            <span className="text-ink-900 text-lg font-bold">
              {claimedCount} of {totalPossible} tiers earned
            </span>
          </Row>
          {isOwnProfile && claimableCount > 0 && (
            <span className="bg-primary-100 text-primary-700 animate-pulse rounded-full px-3 py-1 text-sm font-semibold">
              {claimableCount} ready to claim!
            </span>
          )}
        </Row>
        <ProgressBar
          value={claimedCount}
          max={totalPossible}
          className="w-full"
        />
        {claimedCount === 0 && (
          <span className="text-ink-500 text-sm">
            Start trading and creating to earn trophy tiers!
          </span>
        )}
      </Col>

      {/* Zone 2: Ready to Claim */}
      {isOwnProfile && claimableTrophies.length > 0 && (
        <Col className="gap-3">
          <div className="text-ink-800 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
            Ready to Claim
            <span className="bg-ink-200 h-px flex-1" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {claimableTrophies.map(({ def, progress }) => (
              <TrophyClaimCard
                key={def.id}
                definition={def}
                progress={progress}
                onClaim={handleClaim}
                justClaimedTier={justClaimed[def.id] ?? null}
              />
            ))}
          </div>
        </Col>
      )}

      {/* Zone 3: Almost There */}
      {almostThereTop.length > 0 && (
        <Col className="gap-3">
          <div className="text-ink-800 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
            Almost There
            <span className="bg-ink-200 h-px flex-1" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {almostThereTop.map(({ def, progress }) => (
              <TrophyAlmostCard
                key={def.id}
                definition={def}
                progress={progress}
              />
            ))}
          </div>
        </Col>
      )}

      {/* Zone 4: Full Collection */}
      {CATEGORY_ORDER.map((category) => {
        const defs = byCategory.get(category)
        if (!defs?.length) return null
        return (
          <Col key={category} className="gap-2">
            <div className="text-ink-800 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
              {CATEGORY_LABELS[category]}
              <span className="bg-ink-200 h-px flex-1" />
            </div>
            <Col className="gap-2">
              {defs.map((def) => (
                <TrophyRow
                  key={def.id}
                  definition={def}
                  progress={progressByTrophyId.get(def.id)}
                  onClaim={handleClaim}
                  isOwnProfile={isOwnProfile}
                />
              ))}
            </Col>
          </Col>
        )
      })}
    </Col>
  )
}
