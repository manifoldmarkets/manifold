import { useState } from 'react'
import clsx from 'clsx'
import Image from 'next/image'
import { RanksType } from 'common/achievements'
import {
  formatMoney,
  formatMoneyUSD,
  formatWithCommas,
} from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { TrophyGrid } from 'web/components/trophies/trophy-card'
import { api } from 'web/lib/api/api'
import { isAdminId } from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import {
  TROPHY_DEFINITIONS,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  computeAllTrophyProgress,
  countReachedMilestones,
  countClaimedMilestones,
  getTotalPossibleMilestones,
  formatTrophyValue,
} from 'common/trophies'

// ---------------------------------------------------------------------------
// Showcase slot unlock tracker
// ---------------------------------------------------------------------------

type SlotDef =
  | { type: 'free'; requiredClaims: number }
  | { type: 'purchase'; price: number }

const SHOWCASE_SLOTS: SlotDef[] = [
  { type: 'free', requiredClaims: 0 },
  { type: 'free', requiredClaims: 25 },
  { type: 'free', requiredClaims: 50 },
  // Future: purchasable slots
  // { type: 'purchase', price: 2_500 },
  // { type: 'purchase', price: 5_000 },
]

function ShowcaseSlotTracker(props: {
  claimedCount: number
  reachedCount: number // trophies earned by stats but not yet claimed
}) {
  const { claimedCount, reachedCount } = props
  const max = SHOWCASE_SLOTS[SHOWCASE_SLOTS.length - 1]
  const maxClaims = max.type === 'free' ? max.requiredClaims : 50
  const claimedPct = Math.min(claimedCount / maxClaims, 1) * 100
  const ghostPct = Math.min(reachedCount / maxClaims, 1) * 100

  const nextSlot = SHOWCASE_SLOTS.find(
    (s) => s.type === 'free' && claimedCount < s.requiredClaims
  )
  const unlockedCount = SHOWCASE_SLOTS.filter(
    (s) => s.type === 'free' && claimedCount >= s.requiredClaims
  ).length
  const hintText =
    nextSlot && nextSlot.type === 'free'
      ? `${nextSlot.requiredClaims - claimedCount} more to unlock pin ${unlockedCount + 1}`
      : null

  return (
    <Col className="gap-2.5 rounded-xl border border-amber-400/40 bg-amber-50/50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-950/10">
      <Row className="items-center gap-2">
        <span className="text-base">{'\u{1F3C6}'}</span>
        <Col className="min-w-0 flex-1 gap-0.5">
          <span className="text-ink-900 text-sm font-semibold">
            {unlockedCount} / {SHOWCASE_SLOTS.length} showcase pins
          </span>
          {hintText ? (
            <span className="text-ink-500 text-xs">{hintText}</span>
          ) : (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              All pins unlocked!
            </span>
          )}
        </Col>
      </Row>

      {/* Progress bar with ghost + slot markers */}
      <div className="relative">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-amber-300/60 bg-amber-100/30 dark:border-amber-700/40 dark:bg-amber-900/30">
          {/* Ghost bar: reached but unclaimed trophies */}
          {ghostPct > claimedPct && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300/60 to-yellow-400/50 dark:from-amber-600/30 dark:to-yellow-600/30"
              style={{ width: `${ghostPct}%` }}
            />
          )}
          {/* Solid bar: claimed trophies */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 transition-all"
            style={{ width: `${claimedPct}%` }}
          />
        </div>

        {/* Slot markers below the bar */}
        <Row className="mt-1.5 justify-between">
          {SHOWCASE_SLOTS.map((slot, i) => {
            if (slot.type !== 'free') return null
            const unlocked = claimedCount >= slot.requiredClaims
            return (
              <Row key={i} className="items-center gap-1">
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
                  {unlocked ? 'Unlocked' : `${slot.requiredClaims}`}
                </span>
              </Row>
            )
          })}
        </Row>
      </div>
    </Col>
  )
}

export function TrophiesTab(props: { userId: string; isOwnProfile: boolean }) {
  const { userId, isOwnProfile } = props

  const { data: achievements, refresh, setData } = useAPIGetter(
    'get-user-achievements',
    { userId }
  )

  const currentUser = useUser()
  const isAdmin = currentUser ? isAdminId(currentUser.id) : false

  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [justClaimed, setJustClaimed] = useState<string | null>(null)

  const handleClaim = async (trophyId: string, milestone: string) => {
    setClaimingId(trophyId)
    try {
      await api('claim-trophy', { trophyId, milestone })
      // Optimistically update shared cache so ProfileShowcase sees new claim instantly
      if (achievements) {
        const existingClaims = achievements.claimedTrophies ?? []
        const updatedClaims = [
          ...existingClaims.filter((c) => c.trophyId !== trophyId),
          { trophyId, milestone, claimedAt: new Date().toISOString() },
        ]
        setData({ ...achievements, claimedTrophies: updatedClaims } as any)
      }
      setJustClaimed(trophyId)
      // Delay refresh so the server cache (1s TTL) expires before we re-fetch,
      // otherwise stale data overwrites the optimistic setData above
      setTimeout(() => refresh(), 2000)
    } catch (e) {
      console.error('Failed to claim trophy:', e)
    } finally {
      setClaimingId(null)
    }
  }

  const handleUnclaim = async (trophyId: string) => {
    try {
      await api('unclaim-trophy', { trophyId, userId })
      refresh()
    } catch (e) {
      console.error('Failed to unclaim trophy:', e)
    }
  }

  if (!achievements) {
    return (
      <Col className="items-center py-8">
        <div className="text-ink-400 text-sm">Loading trophies...</div>
      </Col>
    )
  }

  const progressList = computeAllTrophyProgress(achievements)
  const reached = countReachedMilestones(progressList)
  const total = getTotalPossibleMilestones()
  const claimedCount = countClaimedMilestones(achievements.claimedTrophies ?? [])
  const unclaimedCount = reached - claimedCount

  const progressMap = new Map(progressList.map((p) => [p.trophyId, p]))

  // When viewing someone else's profile, only show trophies they've claimed
  const claimedIds = new Set(
    (achievements.claimedTrophies ?? []).map((c) => c.trophyId)
  )
  const visibleDefs = isOwnProfile
    ? TROPHY_DEFINITIONS
    : TROPHY_DEFINITIONS.filter((d) => claimedIds.has(d.id))

  // Group definitions by category
  const byCategory = new Map<string, typeof TROPHY_DEFINITIONS>()
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, [])
  for (const def of visibleDefs)
    byCategory.get(def.category)?.push(def)

  return (
    <Col className="gap-6 pt-4">
      {/* Hero summary */}
      <Col className="gap-1">
        <Row className="items-center gap-2">
          <span className="text-2xl">{'\u{1F3C6}'}</span>
          <Col className="gap-0">
            <span className="text-ink-900 text-lg font-bold">
              {isOwnProfile
                ? `${reached} of ${total} trophies earned`
                : `${claimedCount} trophies claimed`}
            </span>
            {isOwnProfile && unclaimedCount > 0 && (
              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {unclaimedCount} unclaimed
              </span>
            )}
          </Col>
        </Row>
        {isOwnProfile && (
          <span className="text-ink-500 text-sm">
            Earn trophies by trading, creating markets, and being active.
            Claim trophies to pin them to your profile showcase.
          </span>
        )}
      </Col>

      {/* Showcase slot unlock tracker — own profile only */}
      {isOwnProfile && <ShowcaseSlotTracker claimedCount={claimedCount} reachedCount={reached} />}

      {/* Categories */}
      {CATEGORY_ORDER.map((category) => {
        const defs = byCategory.get(category)
        if (!defs?.length) return null
        const catProgress = defs
          .map((d) => progressMap.get(d.id))
          .filter(Boolean) as typeof progressList

        return (
          <Col key={category} className="gap-3">
            <div className="text-ink-800 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
              {CATEGORY_LABELS[category]}
              <span className="bg-ink-200 h-px flex-1" />
            </div>
            <TrophyGrid
              progressList={catProgress}
              definitions={defs}
              claimedTrophies={achievements.claimedTrophies}
              isOwnProfile={isOwnProfile}
              onClaim={handleClaim}
              claimingId={claimingId}
              justClaimedId={justClaimed}
              onPinToProfile={(trophyId: string) => {
                setJustClaimed(null)
                // Build badge data so ProfileShowcase can render it
                // without waiting for its own data refresh
                const def = TROPHY_DEFINITIONS.find((d) => d.id === trophyId)
                const progress = progressMap.get(trophyId)
                const claimed = achievements.claimedTrophies?.find(
                  (c) => c.trophyId === trophyId
                )
                const m = def?.milestones.find(
                  (ms) => ms.name === claimed?.milestone
                )
                window.dispatchEvent(
                  new CustomEvent('open-showcase-picker', {
                    detail: {
                      pinId: `trophy-${trophyId}`,
                      badge: m && def
                        ? {
                            id: `trophy-${trophyId}`,
                            label: m.name,
                            stat: formatTrophyValue(def, progress?.currentValue ?? m.threshold),
                            detail: `${def.label}: ${formatTrophyValue(def, progress?.currentValue ?? m.threshold)} ${def.unit}`,
                            emoji: m.emoji,
                            tier: m.tier,
                          }
                        : undefined,
                    },
                  })
                )
              }}
            />
          </Col>
        )
      })}

      {/* Achievements / Stats section */}
      <AchievementsSection data={achievements} />

      {/* Admin tools: unclaim trophies */}
      {isAdmin && isOwnProfile && achievements.claimedTrophies.length > 0 && (
        <Col className="border-ink-200 mt-4 gap-2 rounded-lg border border-dashed p-3">
          <span className="text-ink-500 text-xs font-mono">
            [ADMIN] Unclaim trophies
          </span>
          <Row className="flex-wrap gap-2">
            {achievements.claimedTrophies.map((c) => (
              <button
                key={c.trophyId}
                className="rounded bg-red-100 px-2 py-1 text-xs text-red-600 hover:bg-red-200"
                onClick={() => handleUnclaim(c.trophyId)}
              >
                {c.trophyId}: {c.milestone}
              </button>
            ))}
          </Row>
        </Col>
      )}

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
  'accountAgeYears', 'charityDonatedMana', 'creatorTraders',
  'largestProfitableTradeValue', 'largestLeagueSeasonEarnings',
  'largestUnprofitableTradeValue', 'longestBettingStreak', 'modTicketsResolved',
  'numberOfComments', 'profitableMarketsCount', 'seasonsDiamondOrHigher',
  'seasonsMasters', 'seasonsPlatinumOrHigher', 'totalLiquidityCreatedMarkets',
  'totalMarketsCreated', 'totalReferrals', 'totalReferredProfitMana',
  'totalTradesCount', 'totalVolumeMana', 'unprofitableMarketsCount',
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

function AchievementsSection(props: { data: Record<string, any> }) {
  const { data } = props

  const defs = [
    { id: 'totalVolumeMana', title: 'Any Whales?', desc: 'Total trading volume.', fmt: () => formatMoney(data.totalVolumeMana, 'MANA') },
    { id: 'totalReferrals', title: 'Manifold Hype Man', desc: 'Friends you brought to Manifold.', fmt: () => formatWithCommas(data.totalReferrals) },
    { id: 'totalReferredProfitMana', title: 'Proud Parent', desc: 'Profit earned by your referrals.', fmt: () => formatMoney(data.totalReferredProfitMana, 'MANA') },
    { id: 'creatorTraders', title: 'Fan Favorite', desc: 'Unique traders on your markets.', fmt: () => formatWithCommas(data.creatorTraders) },
    { id: 'totalLiquidityCreatedMarkets', title: 'No Slippage Here', desc: 'Total liquidity across all your created markets.', fmt: () => formatMoney(data.totalLiquidityCreatedMarkets, 'MANA') },
    { id: 'profitableMarketsCount', title: 'Market Maven', desc: 'Number of markets you made a profit on.', fmt: () => formatWithCommas(data.profitableMarketsCount) },
    { id: 'unprofitableMarketsCount', title: 'Ineffective Altruism', desc: 'Number of markets you lost mana on.', fmt: () => formatWithCommas(data.unprofitableMarketsCount) },
    { id: 'largestProfitableTradeValue', title: 'Biggest Win', desc: 'Largest profit made on a single market.', fmt: () => formatMoney(data.largestProfitableTradeValue, 'MANA') },
    { id: 'largestUnprofitableTradeValue', title: 'Wealth Redistributor', desc: 'Largest loss made on a single market.', fmt: () => formatMoney(data.largestUnprofitableTradeValue, 'MANA') },
    { id: 'seasonsPlatinumOrHigher', title: 'Positively Platinum', desc: 'Seasons finished Platinum or higher.', fmt: () => formatWithCommas(data.seasonsPlatinumOrHigher) },
    { id: 'seasonsDiamondOrHigher', title: 'Diamond Hands', desc: 'Seasons finished Diamond or higher.', fmt: () => formatWithCommas(data.seasonsDiamondOrHigher) },
    { id: 'seasonsMasters', title: 'Master Mind', desc: 'Seasons finished Masters.', fmt: () => formatWithCommas(data.seasonsMasters) },
    { id: 'largestLeagueSeasonEarnings', title: 'Sensational Season', desc: 'Largest earnings in a single season.', fmt: () => formatMoney(data.largestLeagueSeasonEarnings, 'MANA') },
    { id: 'numberOfComments', title: 'Chatterbox', desc: 'Comments posted with at least 1 like.', fmt: () => formatWithCommas(data.numberOfComments) },
    { id: 'totalTradesCount', title: 'High Frequency Trader', desc: 'Total trades executed (excludes API trades).', fmt: () => formatWithCommas(data.totalTradesCount) },
    { id: 'totalMarketsCreated', title: 'Doing The Hard Part', desc: 'Markets you\u2019ve created.', fmt: () => formatWithCommas(data.totalMarketsCreated) },
    {
      id: 'accountAgeYears', title: 'Age Is Just A Number', desc: 'Account age in years.',
      fmt: () => {
        const totalMonths = Math.round(data.accountAgeYears * 12)
        const years = Math.floor(totalMonths / 12)
        const months = totalMonths % 12
        return `${years} ${years === 1 ? 'year' : 'years'} ${months} ${months === 1 ? 'month' : 'months'}`
      },
    },
    { id: 'longestBettingStreak', title: 'Longest Daily Streak', desc: 'Longest consecutive days trading.', fmt: () => formatWithCommas(data.longestBettingStreak) },
    { id: 'modTicketsResolved', title: 'Helpful Moderator', desc: 'Mod tickets resolved (since mod rewards).', fmt: () => formatWithCommas(data.modTicketsResolved) },
    { id: 'charityDonatedMana', title: 'Giver', desc: 'Total donated to charity (USD).', fmt: () => formatMoneyUSD(data.charityDonatedMana, true) },
  ] as const

  const achs = defs.map(({ id, title, desc, fmt }) => {
    const key = RANK_KEY_BY_ID[id]
    const raw = data[id] ?? 0
    const rk = key ? data.ranks?.[key]?.rank ?? null : null
    const pc = key ? data.ranks?.[key]?.percentile ?? null : null
    return { id, title, desc, value: fmt(), rank: raw === 0 ? null : rk, percentile: raw === 0 ? null : pc }
  })

  const byBucket: Record<AchievementBucket, typeof achs> = {
    'Top 50 Users': [], 'Top 200 Users': [], 'Top 1000 Users': [],
    'Top 5000 Users': [], 'Top 20,000 Users': [], 'To Earn': [],
  }
  achs.forEach((a) => { byBucket[bucketOf(a.rank)].push(a) })

  return (
    <Col className="gap-6">
      <Col className="gap-1">
        <Row className="items-center gap-2">
          <span className="text-2xl">{'\u{2728}'}</span>
          <span className="text-ink-900 text-lg font-bold">Stats & Achievements</span>
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
                  imageSrc={ACHIEVEMENT_IMAGES[a.id] || '/achievement-badges/totalVolumeMana.png'}
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
  const { title, description, value, rank, percentile, bucket, imageSrc } = props

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
            <div className="text-ink-900 text-sm font-semibold leading-tight">{title}</div>
            <div className="text-ink-600 text-xs leading-snug">
              {description}
            </div>
            <div className="text-ink-900 text-sm font-medium">{value}</div>
          </div>

          <div className="pointer-events-none absolute left-full top-4 z-20 hidden pl-3 group-hover:block">
            <div className="bg-canvas-50 text-ink-900 border-ink-200 w-56 rounded-md border p-2.5 shadow-xl">
              <div className="text-sm font-semibold">
                Rank: {rank ?? 'N/A'}
              </div>
              <div className="text-ink-600 my-0.5 text-xs">
                {percentile != null
                  ? `Top ${Number(Math.max(percentile, 0.01).toFixed(2))}% of all users`
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

