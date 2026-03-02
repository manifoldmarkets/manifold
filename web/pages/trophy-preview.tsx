import { useState } from 'react'
import clsx from 'clsx'

import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { Avatar } from 'web/components/widgets/avatar'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  TrophyClaimCard,
  TrophyAlmostCard,
  TrophyRow,
} from 'web/components/trophies/trophy-card'
import { ProgressBar } from 'web/components/progress-bar'
import {
  TROPHY_DEFINITIONS,
  type TrophyCategory,
  type TrophyTier,
  type UserTrophyProgress,
  getClaimableTiers,
  getNextUnclaimedTier,
  getProgressFraction,
  countClaimableTiers,
  countClaimedTiers,
  getTotalPossibleTiers,
  TROPHY_TIER_STYLES,
} from 'common/trophies'

// ---------------------------------------------------------------------------
// Showcase trophies — the "cool" ones people actually want to pin
// ---------------------------------------------------------------------------

type ShowcaseTrophy = {
  id: string
  label: string        // short display label
  detail: string       // e.g. "#22 out of 1,204"
  tier: TrophyTier
  emoji: string
}

const MOCK_SHOWCASE_TROPHIES: ShowcaseTrophy[] = [
  {
    id: 'sc-politics-rank',
    label: '#22 in Politics',
    detail: '#22 out of 1,204 predictors',
    tier: 'gold',
    emoji: '\u{1F3DB}', // 🏛️
  },
  {
    id: 'sc-profit-pct',
    label: 'Top 3% Profit',
    detail: 'Top 3% all-time profit',
    tier: 'crimson',
    emoji: '\u{1F4B0}', // 💰
  },
  {
    id: 'sc-streak',
    label: '45-Day Streak',
    detail: '45 consecutive prediction days',
    tier: 'purple',
    emoji: '\u{1F525}', // 🔥
  },
  {
    id: 'sc-viral-market',
    label: '500+ Trader Market',
    detail: 'Created "Will AI pass the bar exam?" — 523 traders',
    tier: 'gold',
    emoji: '\u{1F4C8}', // 📈
  },
  {
    id: 'sc-league',
    label: 'Diamond S12',
    detail: 'Diamond Division — Season 12',
    tier: 'prismatic',
    emoji: '\u{1F48E}', // 💎
  },
  {
    id: 'sc-science-rank',
    label: '#8 in Science',
    detail: '#8 out of 891 predictors',
    tier: 'prismatic',
    emoji: '\u{1F52C}', // 🔬
  },
  {
    id: 'sc-sharp',
    label: '72% Accuracy',
    detail: '72% calibration on 200+ predictions',
    tier: 'blue',
    emoji: '\u{1F3AF}', // 🎯
  },
  {
    id: 'sc-philanthropy',
    label: 'M$50K Donated',
    detail: 'Donated M$50,000 to charity markets',
    tier: 'green',
    emoji: '\u{2764}', // ❤️
  },
]

// ---------------------------------------------------------------------------
// Showcase badge component — used in profile header + trophy picker
// ---------------------------------------------------------------------------

function ShowcaseBadge(props: {
  trophy: ShowcaseTrophy
  size?: 'sm' | 'lg'
  onClick?: () => void
  selected?: boolean
}) {
  const { trophy, size = 'sm', onClick, selected } = props
  const style = TROPHY_TIER_STYLES[trophy.tier]
  const isLarge = size === 'lg'

  return (
    <Tooltip text={trophy.detail}>
      <button
        className={clsx(
          'relative rounded-lg border p-[1.5px] transition-all',
          onClick && 'cursor-pointer hover:scale-105',
          selected
            ? 'ring-primary-500 ring-2 ring-offset-1'
            : 'border-transparent'
        )}
        onClick={onClick}
      >
        <div
          className={clsx(
            'rounded-[5px] bg-gradient-to-br',
            style.gradient
          )}
        >
          <Row
            className={clsx(
              'items-center gap-1.5 rounded-[4px]',
              isLarge ? 'px-3 py-2' : 'px-2 py-1'
            )}
            style={{
              background: `linear-gradient(135deg, rgba(255,255,255,0.85), rgba(255,255,255,0.92))`,
            }}
          >
            <span className={isLarge ? 'text-lg' : 'text-sm'}>
              {trophy.emoji}
            </span>
            <span
              className={clsx(
                'font-semibold',
                isLarge ? 'text-sm' : 'text-xs',
                style.textColor
              )}
            >
              {trophy.label}
            </span>
          </Row>
        </div>
      </button>
    </Tooltip>
  )
}

// Empty showcase slot
function EmptyShowcaseSlot(props: { onClick?: () => void }) {
  return (
    <button
      className="border-ink-300 hover:border-ink-400 flex items-center gap-1.5 rounded-lg border border-dashed px-2 py-1 transition-colors"
      onClick={props.onClick}
    >
      <span className="text-ink-400 text-xs">+ Pin trophy</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Milestone mock data (reuse existing trophy definitions)
// ---------------------------------------------------------------------------

type Preset = 'fresh-claims' | 'new-user' | 'active-user' | 'veteran'

function generateMockProgress(preset: Preset): UserTrophyProgress[] {
  const presets: Record<
    string,
    Record<string, { value: number; claimed: TrophyTier | null }>
  > = {
    'fresh-claims': {
      'trophy-prediction-streak': { value: 45, claimed: null },
      'trophy-whale': { value: 55000, claimed: 'blue' },
      'trophy-high-frequency': { value: 1200, claimed: 'blue' },
      'trophy-sharp-trader': { value: 30, claimed: 'green' },
      'trophy-market-maker': { value: 52, claimed: 'green' },
      'trophy-fan-favorite': { value: 120, claimed: null },
      'trophy-recruiter': { value: 28, claimed: 'gray' },
      'trophy-chatterbox': { value: 510, claimed: 'purple' },
      'trophy-philanthropist': { value: 12000, claimed: 'green' },
      'trophy-sheriff': { value: 30, claimed: null },
      'trophy-platinum-plus': { value: 5, claimed: 'blue' },
      'trophy-diamond-plus': { value: 2, claimed: null },
      'trophy-masters': { value: 1, claimed: null },
      'trophy-veteran': { value: 3.2, claimed: 'blue' },
    },
    'new-user': {
      'trophy-prediction-streak': { value: 8, claimed: null },
      'trophy-high-frequency': { value: 30, claimed: null },
      'trophy-whale': { value: 350, claimed: null },
      'trophy-market-maker': { value: 3, claimed: null },
      'trophy-chatterbox': { value: 6, claimed: null },
      'trophy-veteran': { value: 0.2, claimed: null },
    },
    'active-user': {
      'trophy-prediction-streak': { value: 45, claimed: 'green' },
      'trophy-whale': { value: 15000, claimed: 'green' },
      'trophy-high-frequency': { value: 620, claimed: 'green' },
      'trophy-sharp-trader': { value: 28, claimed: 'green' },
      'trophy-market-maker': { value: 12, claimed: 'gray' },
      'trophy-fan-favorite': { value: 80, claimed: 'green' },
      'trophy-recruiter': { value: 12, claimed: 'gray' },
      'trophy-chatterbox': { value: 110, claimed: 'blue' },
      'trophy-philanthropist': { value: 3500, claimed: 'gray' },
      'trophy-sheriff': { value: 0, claimed: null },
      'trophy-platinum-plus': { value: 3, claimed: 'green' },
      'trophy-diamond-plus': { value: 1, claimed: null },
      'trophy-masters': { value: 0, claimed: null },
      'trophy-veteran': { value: 2.3, claimed: 'green' },
    },
    veteran: {
      'trophy-prediction-streak': { value: 420, claimed: 'gold' },
      'trophy-whale': { value: 650000, claimed: 'crimson' },
      'trophy-high-frequency': { value: 52000, claimed: 'gold' },
      'trophy-sharp-trader': { value: 310, claimed: 'gold' },
      'trophy-market-maker': { value: 280, claimed: 'gold' },
      'trophy-fan-favorite': { value: 11000, claimed: 'gold' },
      'trophy-recruiter': { value: 120, claimed: 'crimson' },
      'trophy-chatterbox': { value: 5200, claimed: 'gold' },
      'trophy-philanthropist': { value: 110000, claimed: 'crimson' },
      'trophy-sheriff': { value: 60, claimed: 'blue' },
      'trophy-platinum-plus': { value: 11, claimed: 'crimson' },
      'trophy-diamond-plus': { value: 5, claimed: 'purple' },
      'trophy-masters': { value: 3, claimed: 'blue' },
      'trophy-veteran': { value: 5.5, claimed: 'gold' },
    },
  }

  const data = presets[preset] ?? presets['fresh-claims']
  const list: UserTrophyProgress[] = []
  for (const def of TROPHY_DEFINITIONS) {
    const p = data[def.id]
    list.push({
      trophyId: def.id,
      currentValue: p?.value ?? 0,
      highestClaimedTier: p?.claimed ?? null,
      lastClaimedTime: p?.claimed ? Date.now() - 86400000 : null,
    })
  }
  return list
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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

const MAX_PINNED = 3
const MOCK_TABS = ['Summary', 'Trades', 'Markets', 'Achievements'] as const

export default function TrophyPreviewPage() {
  const [preset, setPreset] = useState<Preset>('fresh-claims')
  const [progressList, setProgressList] = useState<UserTrophyProgress[]>(
    generateMockProgress('fresh-claims')
  )
  const [justClaimed, setJustClaimed] = useState<Record<string, TrophyTier>>(
    {}
  )
  const [showPresets, setShowPresets] = useState(false)

  // Showcase: pinned trophy IDs (up to 3)
  const [pinnedIds, setPinnedIds] = useState<string[]>([
    'sc-politics-rank',
    'sc-profit-pct',
  ])
  const [showPicker, setShowPicker] = useState(false)

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_PINNED) return prev
      return [...prev, id]
    })
  }

  const switchPreset = (p: Preset) => {
    setPreset(p)
    setProgressList(generateMockProgress(p))
    setJustClaimed({})
  }

  const progressByTrophyId = new Map<string, UserTrophyProgress>()
  for (const p of progressList) {
    progressByTrophyId.set(p.trophyId, p)
  }

  const claimableCount = countClaimableTiers(progressList)
  const claimedCount = countClaimedTiers(progressList)
  const totalPossible = getTotalPossibleTiers()

  const handleClaim = (trophyId: string, tier: TrophyTier) => {
    setJustClaimed((prev) => ({ ...prev, [trophyId]: tier }))
    setProgressList((prev) =>
      prev.map((p) =>
        p.trophyId === trophyId
          ? { ...p, highestClaimedTier: tier, lastClaimedTime: Date.now() }
          : p
      )
    )
  }

  // Zone 2
  const claimableTrophies: {
    def: (typeof TROPHY_DEFINITIONS)[number]
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

  // Zone 3
  const almostThere: {
    def: (typeof TROPHY_DEFINITIONS)[number]
    progress: UserTrophyProgress
  }[] = []
  for (const def of TROPHY_DEFINITIONS) {
    const progress = progressByTrophyId.get(def.id)
    if (!progress || progress.currentValue <= 0) continue
    if (justClaimed[def.id]) continue
    const claimable = getClaimableTiers(
      def.id,
      progress.currentValue,
      progress.highestClaimedTier
    )
    if (claimable.length > 0) continue
    const nextTier = getNextUnclaimedTier(def.id, progress.highestClaimedTier)
    if (!nextTier) continue
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

  // Zone 4
  const byCategory = new Map<
    TrophyCategory,
    (typeof TROPHY_DEFINITIONS)[number][]
  >()
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, [])
  for (const def of TROPHY_DEFINITIONS)
    byCategory.get(def.category)?.push(def)

  const pinnedTrophies = pinnedIds
    .map((id) => MOCK_SHOWCASE_TROPHIES.find((t) => t.id === id))
    .filter(Boolean) as ShowcaseTrophy[]

  return (
    <Page trackPageView={false}>
      <Col className="mx-auto w-full max-w-3xl px-4">
        {/* ── Profile header with showcase ── */}
        <Col className="gap-3 pb-2 pt-4">
          <Row className="items-start gap-4">
            <Avatar
              size="lg"
              avatarUrl={undefined}
              username="DemoUser"
              noLink
            />
            <Col className="min-w-0 flex-1 gap-1.5">
              <span className="text-ink-900 text-2xl font-bold">
                Demo User
              </span>
              <span className="text-ink-500 text-sm">@DemoUser</span>

              {/* Pinned showcase badges */}
              <Row className="mt-1 flex-wrap items-center gap-2">
                {pinnedTrophies.map((t) => (
                  <ShowcaseBadge
                    key={t.id}
                    trophy={t}
                    onClick={() => togglePin(t.id)}
                  />
                ))}
                {pinnedIds.length < MAX_PINNED && (
                  <EmptyShowcaseSlot
                    onClick={() => setShowPicker(!showPicker)}
                  />
                )}
              </Row>
            </Col>
          </Row>
        </Col>

        {/* ── Trophy picker overlay ── */}
        {showPicker && (
          <Col className="bg-canvas-0 border-ink-200 mb-4 gap-3 rounded-xl border p-4">
            <Row className="items-center justify-between">
              <span className="text-ink-900 text-sm font-bold">
                Pin a trophy to your profile
              </span>
              <button
                className="text-ink-500 text-xs hover:underline"
                onClick={() => setShowPicker(false)}
              >
                Done
              </button>
            </Row>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MOCK_SHOWCASE_TROPHIES.map((t) => (
                <ShowcaseBadge
                  key={t.id}
                  trophy={t}
                  size="lg"
                  onClick={() => togglePin(t.id)}
                  selected={pinnedIds.includes(t.id)}
                />
              ))}
            </div>
            <span className="text-ink-500 text-xs">
              Select up to {MAX_PINNED} trophies. Click a pinned trophy to
              remove it.
            </span>
          </Col>
        )}

        {/* ── Mock tab bar ── */}
        <Row className="border-ink-200 mt-2 gap-0 border-b sm:gap-4">
          {MOCK_TABS.map((tab) => (
            <button
              key={tab}
              className={
                tab === 'Achievements'
                  ? 'text-primary-700 border-primary-700 border-b-2 px-3 py-2 text-sm font-semibold'
                  : 'text-ink-500 px-3 py-2 text-sm font-medium'
              }
              onClick={undefined}
            >
              {tab}
            </button>
          ))}
        </Row>

        {/* ── Trophy content ── */}
        <Col className="gap-8 pb-12 pt-4">
          {/* Zone 1: Hero Summary */}
          <Col className="bg-canvas-0 border-ink-200 gap-3 rounded-xl border px-5 py-4">
            <Row className="items-center justify-between">
              <Row className="items-center gap-2">
                <span className="text-2xl">{'\u{1F3C6}'}</span>
                <span className="text-ink-900 text-lg font-bold">
                  {claimedCount} of {totalPossible} tiers earned
                </span>
              </Row>
              {claimableCount > 0 && (
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
          {claimableTrophies.length > 0 && (
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      isOwnProfile={true}
                    />
                  ))}
                </Col>
              </Col>
            )
          })}
        </Col>

        {/* ── Preset switcher (floating pill) ── */}
        <div className="fixed bottom-4 right-4 z-50">
          {showPresets ? (
            <Col className="bg-canvas-0 border-ink-200 gap-2 rounded-lg border p-3 shadow-lg">
              <Row className="items-center justify-between">
                <span className="text-ink-600 text-xs font-semibold uppercase">
                  Demo preset
                </span>
                <button
                  className="text-ink-400 text-xs hover:underline"
                  onClick={() => setShowPresets(false)}
                >
                  Close
                </button>
              </Row>
              {(
                [
                  ['fresh-claims', 'Interactive'],
                  ['new-user', 'New User'],
                  ['active-user', 'Active User'],
                  ['veteran', 'Veteran'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  color={preset === key ? 'indigo' : 'gray-outline'}
                  size="xs"
                  onClick={() => switchPreset(key)}
                >
                  {label}
                </Button>
              ))}
            </Col>
          ) : (
            <button
              className="bg-canvas-0 border-ink-200 text-ink-600 rounded-full border px-3 py-1.5 text-xs font-medium shadow-md"
              onClick={() => setShowPresets(true)}
            >
              Switch demo
            </button>
          )}
        </div>
      </Col>
    </Page>
  )
}
