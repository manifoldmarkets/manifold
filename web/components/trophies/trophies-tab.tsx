import { useState } from 'react'
import clsx from 'clsx'
import Image from 'next/image'
import toast from 'react-hot-toast'

import { RanksType } from 'common/achievements'
import { APIResponse } from 'common/api/schema'
import { isAdminId } from 'common/envs/constants'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  SHOWCASE_SLOT_UNLOCKS,
  TROPHY_DEFINITIONS,
  TrophyCategory,
  TrophyDefinition,
  TrophyStats,
  computeAllTrophyProgress,
  countClaimedMilestones,
  countEarnedMilestones,
  countUnclaimedReachedMilestones,
  getClaimedMilestoneIds,
  getHighestClaimedMilestone,
  getMilestone,
  getTrophyDefinition,
  getTotalPossibleMilestones,
  getTrophyDefinitionsFor,
  getTrophyPinId,
} from 'common/trophies'
import {
  formatMoney,
  formatMoneyUSD,
  formatWithCommas,
} from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { openShowcasePicker } from 'web/components/trophies/open-showcase-picker'
import { TrophyGrid } from 'web/components/trophies/trophy-card'
import { TrophyClaimModal, TrophyDialog } from './trophy-claim-modal'
import { TrophyOnboardingSection } from './trophy-onboarding-section'
import { formatTrophyReward } from './trophy-reward-chip'
import { useTrophyRewardMultiplier } from 'web/hooks/use-trophy-reward-multiplier'
import { useUser } from 'web/hooks/use-user'
import { useUserAchievements } from 'web/hooks/use-user-achievements'
import {
  addTrophyClaims,
  addTrophyRewards,
  replaceTrophyClaims,
  useUserTrophies,
} from 'web/hooks/use-user-trophies'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'

export function TrophiesTab(props: {
  userId: string
  isOwnProfile: boolean
  // The account's signup time, for an exact Account Age countdown.
  accountCreatedTime?: number
}) {
  const { userId, isOwnProfile, accountCreatedTime } = props

  // Both shared live with ProfileShowcase, so a claim shows up there at once
  // and both show the same stats.
  const {
    achievements,
    error: achievementsError,
    loading: achievementsLoading,
    retry: retryAchievements,
  } = useUserAchievements(userId)
  const { trophies, error: trophiesError } = useUserTrophies(userId)

  const currentUser = useUser()
  const isAdmin = !!currentUser && isAdminId(currentUser.id)
  const rewardMultiplier = useTrophyRewardMultiplier()

  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [justClaimed, setJustClaimed] = useState<string | null>(null)
  const [dialog, setDialog] = useState<TrophyDialog | null>(null)

  const openExplainer = (source: 'tab' | 'first claim') => {
    setDialog({ step: 'explainer' })
    track('trophy explainer shown', { source })
  }
  const pinTrophy = (trophyId: string) => {
    setDialog(null)
    setJustClaimed(null)
    openShowcasePicker(userId, { pinId: getTrophyPinId(trophyId) })
  }

  const handleClaim = async (trophyId: string, milestoneId: string) => {
    if (claimingId || !trophies || !isOwnProfile) return
    setClaimingId(trophyId)
    try {
      const { claims, newlyClaimed, rewardAmount, rewarded } = await api(
        'claim-trophy',
        {
          userId,
          trophyId,
          milestoneId,
        }
      )
      addTrophyClaims(userId, claims)
      addTrophyRewards(userId, rewarded)
      const first =
        trophies.claims.length === 0 &&
        newlyClaimed.length > 0 &&
        claims.length === newlyClaimed.length
      const definition = getTrophyDefinition(trophyId)
      const milestone =
        definition &&
        (getHighestClaimedMilestone(definition, newlyClaimed) ??
          getMilestone(definition, milestoneId))
      if (milestone && (first || rewardAmount > 0)) {
        setJustClaimed(null)
        setDialog({
          step: 'celebration',
          trophyId,
          milestone,
          more: Math.max(0, newlyClaimed.length - 1),
          rewardAmount: rewardAmount ?? 0,
          first,
        })
        track('trophy claim modal shown', {
          trophyId,
          milestoneId: milestone.id,
          first,
          rewardAmount,
        })
      } else {
        setJustClaimed(trophyId)
        if (rewardAmount > 0)
          toast.success(`+${formatTrophyReward(rewardAmount)} trophy reward`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setClaimingId(null)
    }
  }

  const handleUnclaim = async (trophyId: string) => {
    try {
      const { claims } = await api('unclaim-trophy', { trophyId, userId })
      replaceTrophyClaims(userId, claims)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const starterStats = isOwnProfile ? trophies?.starter ?? null : null
  const onboarding = starterStats && trophies && (
    <TrophyOnboardingSection
      starter={starterStats}
      claims={trophies.claims}
      rewarded={trophies.rewarded}
      multiplier={rewardMultiplier}
      claimingId={claimingId}
      onClaim={handleClaim}
    />
  )
  const modal = dialog && isOwnProfile && trophies && (
    <TrophyClaimModal
      dialog={dialog}
      trophies={trophies}
      multiplier={rewardMultiplier}
      onClose={() => setDialog(null)}
      onExplain={() => openExplainer('first claim')}
      onPin={pinTrophy}
    />
  )

  if (!achievements) {
    return (
      <Col className="gap-6 pt-4">
        {onboarding}
        {modal}
        <Col className="items-center gap-2 py-8">
          {achievementsError && !achievementsLoading ? (
            <>
              <div className="text-ink-500 text-sm">Stats couldn't load.</div>
              <button
                className="text-primary-600 text-sm font-medium hover:underline"
                onClick={retryAchievements}
              >
                Try again
              </button>
            </>
          ) : (
            <div className="text-ink-400 text-sm">Loading trophies...</div>
          )}
        </Col>
      </Col>
    )
  }
  // A later refresh failed: the stats shown may be out of date.
  const refreshFailed = !!achievementsError && !achievementsLoading
  if (!trophies) {
    return (
      <Col className="gap-6 pt-4">
        <div className="text-ink-500 py-4 text-center text-sm">
          {trophiesError
            ? "Trophies couldn't load. Try again later."
            : 'Loading trophies...'}
        </div>
        {refreshFailed && <StatsRefreshNotice onRetry={retryAchievements} />}
        <AchievementsSection data={achievements} />
      </Col>
    )
  }

  const { claims, starter } = trophies
  // "Getting started" trophies, and their live counts, are for new accounts.
  const earnableDefs = getTrophyDefinitionsFor(!!starter)
  const stats: TrophyStats = { ...achievements, ...(starter ?? {}) }
  const progressList = computeAllTrophyProgress(stats, earnableDefs)
  // Reached or claimed: a claim stays even if the stat drops back.
  const reached = countEarnedMilestones(stats, claims, earnableDefs)
  const total = getTotalPossibleMilestones(earnableDefs)
  const claimedCount = countClaimedMilestones(claims)
  const unclaimedCount = countUnclaimedReachedMilestones(
    stats,
    claims,
    earnableDefs
  )

  const claimedIdsByTrophy = new Map(
    TROPHY_DEFINITIONS.map((d) => [d.id, getClaimedMilestoneIds(claims, d.id)])
  )
  // Other people's profiles show only trophies they have claimed.
  const visibleDefs = isOwnProfile
    ? earnableDefs
    : TROPHY_DEFINITIONS.filter((d) => claimedIdsByTrophy.get(d.id)?.size)

  const byCategory = new Map<TrophyCategory, TrophyDefinition[]>(
    CATEGORY_ORDER.map((c) => [c, []])
  )
  for (const def of visibleDefs) byCategory.get(def.category)?.push(def)

  const claimedTrophyIds = TROPHY_DEFINITIONS.filter(
    (d) => claimedIdsByTrophy.get(d.id)?.size
  ).map((d) => d.id)

  return (
    <Col className="gap-6 pt-4">
      {onboarding}
      {modal}
      <Col className="gap-1">
        <Row className="items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {'\u{1F3C6}'}
          </span>
          <Col className="gap-0">
            <span className="text-ink-900 text-lg font-bold">
              {isOwnProfile
                ? `${reached} of ${total} trophies earned`
                : `${claimedCount} ${
                    claimedCount === 1 ? 'trophy' : 'trophies'
                  } claimed`}
            </span>
            {isOwnProfile && unclaimedCount > 0 && (
              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {unclaimedCount} ready to claim
              </span>
            )}
          </Col>
        </Row>
        {isOwnProfile && (
          <div className="text-ink-500 text-sm">
            Earn trophies by trading, creating markets and being active. Claim
            them to pin them to your profile.{' '}
            <button
              className="text-primary-600 hover:underline"
              onClick={() => openExplainer('tab')}
            >
              How trophies work
            </button>
          </div>
        )}
      </Col>

      {refreshFailed && <StatsRefreshNotice onRetry={retryAchievements} />}

      {isOwnProfile && (
        <ShowcaseSlotTracker
          claimedCount={claimedCount}
          reachedCount={reached}
        />
      )}

      {CATEGORY_ORDER.map((category) => {
        const defs = byCategory.get(category)
        if (!defs?.length) return null
        return (
          <Col key={category} className="gap-3">
            <div className="text-ink-800 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
              {CATEGORY_LABELS[category]}
              <span className="bg-ink-200 h-px flex-1" />
            </div>
            <TrophyGrid
              progressList={progressList}
              definitions={defs}
              claimedIdsByTrophy={claimedIdsByTrophy}
              rewarded={trophies.rewarded}
              isOwnProfile={isOwnProfile}
              rewardMultiplier={
                isOwnProfile && starter ? rewardMultiplier : undefined
              }
              onClaim={handleClaim}
              claimingId={claimingId}
              justClaimedId={justClaimed}
              accountCreatedTime={accountCreatedTime}
              onPinToProfile={pinTrophy}
            />
          </Col>
        )
      })}

      <AchievementsSection data={achievements} />

      {isAdmin && isOwnProfile && claimedTrophyIds.length > 0 && (
        <Col className="border-ink-200 mt-4 gap-2 rounded-lg border border-dashed p-3">
          <span className="text-ink-500 font-mono text-xs">
            [ADMIN] Unclaim trophies
          </span>
          <Row className="flex-wrap gap-2">
            {claimedTrophyIds.map((trophyId) => (
              <button
                key={trophyId}
                className="bg-scarlet-100 text-scarlet-700 hover:bg-scarlet-200 rounded px-2 py-1 text-xs"
                onClick={() => handleUnclaim(trophyId)}
              >
                {trophyId}
              </button>
            ))}
          </Row>
        </Col>
      )}
    </Col>
  )
}

function StatsRefreshNotice(props: { onRetry: () => void }) {
  return (
    <Row className="text-ink-500 items-center gap-2 text-sm">
      <span>Couldn't refresh these stats.</span>
      <button
        className="text-primary-600 font-medium hover:underline"
        onClick={props.onRetry}
      >
        Try again
      </button>
    </Row>
  )
}

function ShowcaseSlotTracker(props: {
  claimedCount: number
  reachedCount: number // earned, whether claimed or not
}) {
  const { claimedCount, reachedCount } = props
  const maxClaims = SHOWCASE_SLOT_UNLOCKS[SHOWCASE_SLOT_UNLOCKS.length - 1]
  const claimedPct = Math.min(claimedCount / maxClaims, 1) * 100
  const ghostPct = Math.min(reachedCount / maxClaims, 1) * 100

  const unlockedCount = SHOWCASE_SLOT_UNLOCKS.filter(
    (needed) => claimedCount >= needed
  ).length
  const nextUnlock = SHOWCASE_SLOT_UNLOCKS.find(
    (needed) => claimedCount < needed
  )

  return (
    <Col className="gap-2.5 rounded-xl border border-amber-400/40 bg-amber-50/50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-950/10">
      <Row className="items-center gap-2">
        <span className="text-base" aria-hidden>
          {'\u{1F3C6}'}
        </span>
        <Col className="min-w-0 flex-1 gap-0.5">
          <span className="text-ink-900 text-sm font-semibold">
            {unlockedCount} / {SHOWCASE_SLOT_UNLOCKS.length} profile pins
          </span>
          {nextUnlock !== undefined ? (
            <span className="text-ink-500 text-xs">
              Claim {nextUnlock - claimedCount} more milestones to unlock pin{' '}
              {unlockedCount + 1}
            </span>
          ) : (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              All pins unlocked
            </span>
          )}
        </Col>
      </Row>

      <div className="relative">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-amber-300/60 bg-amber-100/30 dark:border-amber-700/40 dark:bg-amber-900/30">
          {/* Earned but unclaimed */}
          {ghostPct > claimedPct && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300/60 to-yellow-400/50 dark:from-amber-600/30 dark:to-yellow-600/30"
              style={{ width: `${ghostPct}%` }}
            />
          )}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 transition-all"
            style={{ width: `${claimedPct}%` }}
          />
        </div>

        <Row className="mt-1.5 justify-between">
          {SHOWCASE_SLOT_UNLOCKS.map((needed, i) => {
            const unlocked = claimedCount >= needed
            return (
              <Row key={needed} className="items-center gap-1">
                <div
                  className={clsx(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                    unlocked
                      ? 'bg-amber-500 text-white shadow-sm dark:bg-amber-400 dark:text-amber-950'
                      : 'border border-amber-300/60 bg-amber-100/50 text-amber-400 dark:border-amber-600/40 dark:bg-amber-900/30 dark:text-amber-600'
                  )}
                >
                  {i + 1}
                </div>
                <span
                  className={clsx(
                    'text-[11px] leading-none',
                    unlocked
                      ? 'font-medium text-amber-700 dark:text-amber-400'
                      : 'text-ink-400'
                  )}
                >
                  {unlocked ? 'Unlocked' : `${needed}`}
                </span>
              </Row>
            )
          })}
        </Row>
      </div>
    </Col>
  )
}

// ---------------------------------------------------------------------------
// Achievements / Stats section (moved from profile page)
// ---------------------------------------------------------------------------

const RANK_KEY_BY_ID: Record<string, keyof RanksType> = {
  totalVolumeMana: 'volume',
  totalReferrals: 'totalReferrals',
  totalReferredProfitMana: 'totalReferredProfit',
  creatorTraders: 'creatorTraders',
  totalLiquidityCreatedMarkets: 'liquidity',
  profitableMarketsCount: 'profitableMarkets',
  unprofitableMarketsCount: 'unprofitableMarkets',
  largestProfitableTradeValue: 'largestProfitableTrade',
  largestUnprofitableTradeValue: 'largestUnprofitableTrade',
  seasonsPlatinumOrHigher: 'seasonsPlatinumOrHigher',
  seasonsDiamondOrHigher: 'seasonsDiamondOrHigher',
  seasonsMasters: 'seasonsMasters',
  largestLeagueSeasonEarnings: 'largestLeagueSeasonEarnings',
  numberOfComments: 'comments',
  totalTradesCount: 'trades',
  totalMarketsCreated: 'marketsCreated',
  accountAgeYears: 'accountAge',
  longestBettingStreak: 'longestBettingStreak',
  modTicketsResolved: 'modTickets',
  charityDonatedMana: 'charityDonated',
}

const ACHIEVEMENT_IMAGE_KEYS = [
  'accountAgeYears',
  'charityDonatedMana',
  'creatorTraders',
  'largestProfitableTradeValue',
  'largestLeagueSeasonEarnings',
  'largestUnprofitableTradeValue',
  'longestBettingStreak',
  'modTicketsResolved',
  'numberOfComments',
  'profitableMarketsCount',
  'seasonsDiamondOrHigher',
  'seasonsMasters',
  'seasonsPlatinumOrHigher',
  'totalLiquidityCreatedMarkets',
  'totalMarketsCreated',
  'totalReferrals',
  'totalReferredProfitMana',
  'totalTradesCount',
  'totalVolumeMana',
  'unprofitableMarketsCount',
] as const

const ACHIEVEMENT_IMAGES: Record<string, string> = Object.fromEntries(
  ACHIEVEMENT_IMAGE_KEYS.map((k) => [k, `/achievement-badges/${k}.png`])
)

type AchievementBucket =
  | 'Top 50 Users'
  | 'Top 200 Users'
  | 'Top 1000 Users'
  | 'Top 5000 Users'
  | 'Top 20,000 Users'
  | 'To Earn'

const BUCKET_STYLES: Record<AchievementBucket, string> = {
  'Top 50 Users': 'from-fuchsia-500 to-indigo-500',
  'Top 200 Users': 'from-indigo-500 to-sky-500',
  'Top 1000 Users': 'from-sky-500 to-teal-500',
  'Top 5000 Users': 'from-emerald-500 to-lime-500',
  'Top 20,000 Users': 'from-slate-500 to-zinc-500',
  'To Earn': 'from-zinc-400 to-zinc-600',
}

const BUCKET_ORDER: AchievementBucket[] = [
  'Top 50 Users',
  'Top 200 Users',
  'Top 1000 Users',
  'Top 5000 Users',
  'Top 20,000 Users',
  'To Earn',
]

function bucketOf(rank: number | null): AchievementBucket {
  if (rank == null) return 'To Earn'
  if (rank <= 50) return 'Top 50 Users'
  if (rank <= 200) return 'Top 200 Users'
  if (rank <= 1000) return 'Top 1000 Users'
  if (rank <= 5000) return 'Top 5000 Users'
  if (rank <= 20000) return 'Top 20,000 Users'
  return 'To Earn'
}

function AchievementsSection(props: {
  data: APIResponse<'get-user-achievements'>
}) {
  const { data } = props

  const defs = [
    {
      id: 'totalVolumeMana',
      title: 'Any Whales?',
      desc: 'Total trading volume.',
      fmt: () => formatMoney(data.totalVolumeMana, 'MANA'),
    },
    {
      id: 'totalReferrals',
      title: 'Manifold Hype Man',
      desc: 'Friends you brought to Manifold.',
      fmt: () => formatWithCommas(data.totalReferrals),
    },
    {
      id: 'totalReferredProfitMana',
      title: 'Proud Parent',
      desc: 'Profit earned by your referrals.',
      fmt: () => formatMoney(data.totalReferredProfitMana, 'MANA'),
    },
    {
      id: 'creatorTraders',
      title: 'Fan Favorite',
      desc: 'Traders on your markets, counted once per market.',
      fmt: () => formatWithCommas(data.creatorTraders),
    },
    {
      id: 'totalLiquidityCreatedMarkets',
      title: 'No Slippage Here',
      desc: 'Total liquidity across all your created markets.',
      fmt: () => formatMoney(data.totalLiquidityCreatedMarkets, 'MANA'),
    },
    {
      id: 'profitableMarketsCount',
      title: 'Market Maven',
      desc: 'Number of markets you made a profit on.',
      fmt: () => formatWithCommas(data.profitableMarketsCount),
    },
    {
      id: 'unprofitableMarketsCount',
      title: 'Ineffective Altruism',
      desc: 'Number of markets you lost mana on.',
      fmt: () => formatWithCommas(data.unprofitableMarketsCount),
    },
    {
      id: 'largestProfitableTradeValue',
      title: 'Biggest Win',
      desc: 'Largest profit made on a single market.',
      fmt: () => formatMoney(data.largestProfitableTradeValue, 'MANA'),
    },
    {
      id: 'largestUnprofitableTradeValue',
      title: 'Wealth Redistributor',
      desc: 'Largest loss made on a single market.',
      fmt: () => formatMoney(data.largestUnprofitableTradeValue, 'MANA'),
    },
    {
      id: 'seasonsPlatinumOrHigher',
      title: 'Positively Platinum',
      desc: 'Seasons finished Platinum or higher.',
      fmt: () => formatWithCommas(data.seasonsPlatinumOrHigher),
    },
    {
      id: 'seasonsDiamondOrHigher',
      title: 'Diamond Hands',
      desc: 'Seasons finished Diamond or higher.',
      fmt: () => formatWithCommas(data.seasonsDiamondOrHigher),
    },
    {
      id: 'seasonsMasters',
      title: 'Master Mind',
      desc: 'Seasons finished Masters.',
      fmt: () => formatWithCommas(data.seasonsMasters),
    },
    {
      id: 'largestLeagueSeasonEarnings',
      title: 'Sensational Season',
      desc: 'Largest earnings in a single season.',
      fmt: () => formatMoney(data.largestLeagueSeasonEarnings, 'MANA'),
    },
    {
      id: 'numberOfComments',
      title: 'Chatterbox',
      desc: 'Comments you’ve posted.',
      fmt: () => formatWithCommas(data.numberOfComments),
    },
    {
      id: 'totalTradesCount',
      title: 'High Frequency Trader',
      desc: 'Total trades executed (excludes API trades).',
      fmt: () => formatWithCommas(data.totalTradesCount),
    },
    {
      id: 'totalMarketsCreated',
      title: 'Doing The Hard Part',
      desc: 'Markets you\u2019ve created.',
      fmt: () => formatWithCommas(data.totalMarketsCreated),
    },
    {
      id: 'accountAgeYears',
      title: 'Age Is Just A Number',
      desc: 'Account age in years.',
      fmt: () => {
        const totalMonths = Math.round(data.accountAgeYears * 12)
        const years = Math.floor(totalMonths / 12)
        const months = totalMonths % 12
        return `${years} ${years === 1 ? 'year' : 'years'} ${months} ${
          months === 1 ? 'month' : 'months'
        }`
      },
    },
    {
      id: 'longestBettingStreak',
      title: 'Longest Daily Streak',
      desc: 'Longest consecutive days trading.',
      fmt: () => formatWithCommas(data.longestBettingStreak),
    },
    {
      id: 'modTicketsResolved',
      title: 'Helpful Moderator',
      desc: 'Mod tickets resolved (since mod rewards).',
      fmt: () => formatWithCommas(data.modTicketsResolved),
    },
    {
      id: 'charityDonatedMana',
      title: 'Giver',
      desc: 'Total donated to charity (USD).',
      fmt: () => formatMoneyUSD(data.charityDonatedMana, true),
    },
  ] as const

  const achs = defs.map(({ id, title, desc, fmt }) => {
    const key = RANK_KEY_BY_ID[id]
    const raw = data[id] ?? 0
    const rk = key ? data.ranks?.[key]?.rank ?? null : null
    const pc = key ? data.ranks?.[key]?.percentile ?? null : null
    return {
      id,
      title,
      desc,
      value: fmt(),
      rank: raw === 0 ? null : rk,
      percentile: raw === 0 ? null : pc,
    }
  })

  const byBucket: Record<AchievementBucket, typeof achs> = {
    'Top 50 Users': [],
    'Top 200 Users': [],
    'Top 1000 Users': [],
    'Top 5000 Users': [],
    'Top 20,000 Users': [],
    'To Earn': [],
  }
  achs.forEach((a) => {
    byBucket[bucketOf(a.rank)].push(a)
  })

  return (
    <Col className="gap-6">
      <Col className="gap-1">
        <Row className="items-center gap-2">
          <span className="text-2xl">{'\u{2728}'}</span>
          <span className="text-ink-900 text-lg font-bold">
            Stats & Achievements
          </span>
        </Row>
        <span className="text-ink-500 text-sm">
          Your rank among all Manifold users for each stat.
        </span>
      </Col>

      {BUCKET_ORDER.map((bucket) => {
        const items = byBucket[bucket]
        if (!items.length) return null
        const sorted = items.slice().sort((a, b) => {
          const ra = a.rank ?? Infinity
          const rb = b.rank ?? Infinity
          if (ra !== rb) return ra - rb
          return (a.percentile ?? Infinity) - (b.percentile ?? Infinity)
        })
        return (
          <Col key={bucket} className="gap-3">
            <div className="text-ink-800 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
              {bucket}
              <span className="bg-ink-200 h-px flex-1" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((a) => (
                <AchievementBadgeCard
                  key={a.id}
                  title={a.title}
                  description={a.desc}
                  value={a.value}
                  rank={a.rank}
                  percentile={a.percentile}
                  imageSrc={
                    ACHIEVEMENT_IMAGES[a.id] ||
                    '/achievement-badges/totalVolumeMana.png'
                  }
                  bucket={bucket}
                />
              ))}
            </div>
          </Col>
        )
      })}
    </Col>
  )
}

function AchievementBadgeCard(props: {
  title: string
  description: string
  value: string
  rank: number | null
  percentile: number | null
  bucket: AchievementBucket
  imageSrc?: string
}) {
  const { title, description, value, rank, percentile, bucket, imageSrc } =
    props

  return (
    <div
      className="border-ink-200 group relative rounded-lg border p-[1px] transition-shadow hover:shadow-md"
      aria-label={title}
    >
      {rank != null && rank <= 20000 && (
        <div className="absolute right-0 top-0 z-20">
          <div className="bg-primary-500 text-ink-0 rounded-bl-md rounded-tr-lg px-1.5 py-0.5 text-[10px] font-semibold shadow-sm">
            #{rank}
          </div>
        </div>
      )}
      <div
        className={clsx(
          'h-full rounded-lg bg-gradient-to-br',
          BUCKET_STYLES[bucket]
        )}
      >
        <div className="bg-canvas-0 flex h-full items-center gap-3 rounded-[7px] px-3 py-2.5">
          <div
            className={clsx(
              'ring-ink-300/50 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1',
              bucket === 'To Earn' && 'opacity-40 grayscale'
            )}
          >
            {imageSrc ? (
              <Image
                src={imageSrc}
                alt={title}
                width={48}
                height={48}
                className="h-12 w-12 scale-125 rounded-full object-contain"
              />
            ) : null}
          </div>
          <div
            className={clsx(
              'min-w-0 flex-1',
              bucket === 'To Earn' && 'opacity-40'
            )}
          >
            <div className="text-ink-900 text-sm font-semibold leading-tight">
              {title}
            </div>
            <div className="text-ink-600 text-xs leading-snug">
              {description}
            </div>
            <div className="text-ink-900 text-sm font-medium">{value}</div>
          </div>

          <div className="pointer-events-none absolute left-full top-4 z-20 hidden pl-3 group-hover:block">
            <div className="bg-canvas-50 text-ink-900 border-ink-200 w-56 rounded-md border p-2.5 shadow-xl">
              <div className="text-sm font-semibold">Rank: {rank ?? 'N/A'}</div>
              <div className="text-ink-600 my-0.5 text-xs">
                {percentile != null
                  ? `Top ${Number(
                      Math.max(percentile, 0.01).toFixed(2)
                    )}% of all users`
                  : 'N/A'}
              </div>
              <div className="text-ink-600 text-xs">Value: {value}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
