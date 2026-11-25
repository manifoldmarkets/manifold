import { useEffect, useState } from 'react'
import clsx from 'clsx'

import {
  DIVISION_NAMES,
  type League,
  type league_user_info,
} from 'common/leagues'
import {
  LEAGUE_SHOWCASE_PIN,
  TROPHY_DEFINITIONS,
  TROPHY_TIER_ORDER,
  TrophyClaim,
  TrophyDefinition,
  TrophyMilestone,
  TrophyStats,
  TrophyTier,
  TrophyRankTier,
  getHeldTrophyTitles,
  countClaimedMilestones,
  formatNetWorthPeak,
  formatTrophyValue,
  getHighestClaimedMilestone,
  getMaxShowcasePins,
  getTrophyDisplayStats,
  getTrophyPinId,
} from 'common/trophies'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  OPEN_SHOWCASE_PICKER_EVENT,
  ShowcasePickerRequest,
  takeShowcasePickerRequest,
} from 'web/components/trophies/open-showcase-picker'
import { TrophyBadgeImage } from 'web/components/trophies/trophy-badge-image'
import { formatRankValue, TrophyRankChip, TrophyRankRing } from './trophy-rank'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  useCurrentSeason,
  useLeagueInfo,
  useSeasonCheckedAt,
} from 'web/hooks/use-leagues'
import { useUserAchievements } from 'web/hooks/use-user-achievements'
import {
  refreshUserTrophies,
  setShowcasePins,
  useUserTrophies,
} from 'web/hooks/use-user-trophies'

// Pinned trophies under a user's name on their profile.
export function ProfileShowcase(props: {
  userId: string
  isOwnProfile: boolean
}) {
  const { userId, isOwnProfile } = props

  const { achievements } = useUserAchievements(userId)
  const { trophies } = useUserTrophies(userId)
  const leagueInfo = useLeagueInfo(userId)
  const season = useCurrentSeason()
  const seasonCheckedAt = useSeasonCheckedAt()
  const trophySeason = trophies?.season
  useEffect(() => {
    if (
      trophySeason !== undefined &&
      season !== undefined &&
      trophySeason < season
    ) {
      refreshUserTrophies(userId)
    }
  }, [season, seasonCheckedAt, trophySeason, userId])

  const [showPicker, setShowPicker] = useState(false)
  const [pickerMessage, setPickerMessage] = useState<string | null>(null)
  const [request, setRequest] = useState<ShowcasePickerRequest | null>(null)

  const claims = trophies?.claims ?? []
  const held = getHeldTrophyTitles(trophies?.ranks ?? [])
  const maxPins = getMaxShowcasePins(countClaimedMilestones(claims))

  const savedPins = trophies?.pins
  const league = trophies?.league
  // Older API responses omit the league. Keep its saved pin editable.
  const leagueBadges = league
    ? getLeagueBadges(league, leagueInfo)
    : league === undefined && savedPins?.includes(LEAGUE_SHOWCASE_PIN)
    ? [LEAGUE_PLACEHOLDER_BADGE]
    : []
  const badges = sortBadges([
    ...getTrophyBadges(
      getTrophyDisplayStats(achievements, trophies),
      claims,
      held
    ),
    ...leagueBadges,
  ])
  const badgeById = new Map(badges.map((b) => [b.id, b]))

  // Saved pins, minus ones that can no longer show.
  // null: never set, so show the best badges. []: the user removed them all.
  const pins =
    savedPins == null
      ? badges.slice(0, maxPins).map((b) => b.id)
      : savedPins.filter((id) => badgeById.has(id)).slice(0, maxPins)
  const pinnedBadges = pins.flatMap((id) => badgeById.get(id) ?? [])

  const savePins = (next: string[]) => setShowcasePins(userId, next)

  const togglePin = (id: string) => {
    if (pins.includes(id)) {
      savePins(pins.filter((p) => p !== id))
      setPickerMessage(null)
    } else if (pins.length < maxPins) {
      savePins([...pins, id])
      setPickerMessage(null)
    } else {
      setPickerMessage('Unpin a trophy first')
    }
  }

  // "Pin to profile" on a just-claimed trophy card: take the request when it
  // is sent, or on mount if it was sent while this was not mounted.
  useEffect(() => {
    if (!isOwnProfile) return
    const take = () => {
      const next = takeShowcasePickerRequest(userId)
      if (next) setRequest(next)
    }
    take()
    window.addEventListener(OPEN_SHOWCASE_PICKER_EVENT, take)
    return () => window.removeEventListener(OPEN_SHOWCASE_PICKER_EVENT, take)
  }, [isOwnProfile, userId])

  useEffect(() => {
    if (!request || !trophies) return
    setRequest(null)
    setShowPicker(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const { pinId } = request
    if (!pinId) return setPickerMessage(null)
    if (pins.includes(pinId)) {
      // Make an automatic choice the user's own, so a better trophy claimed
      // later doesn't push it out.
      if (savedPins == null) savePins(pins)
      return setPickerMessage(null)
    }
    // Pins the user never chose make way for one they did.
    const base = savedPins == null ? pins.slice(0, maxPins - 1) : pins
    if (base.length >= maxPins) return setPickerMessage('Unpin a trophy first')
    savePins([...base, pinId])
    setPickerMessage(null)
    // Runs once per request, with the state of the render that set it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, trophies])

  if (!trophies || (badges.length === 0 && !held.length && !isOwnProfile))
    return null

  return (
    <>
      {held.length > 0 && (
        <Row className="mb-1.5 flex-wrap items-center gap-1.5">
          {held.map(({ definition, tier, rank, value }) => (
            <TrophyRankChip
              key={definition.id}
              definition={definition}
              tier={tier}
              rank={rank}
              value={value}
              computedTime={trophies.ranksComputedTime}
            />
          ))}
        </Row>
      )}
      <Row className="flex-wrap items-center gap-1.5">
        {pinnedBadges.map((b) => (
          <ShowcaseBadge
            key={b.id}
            badge={b}
            onClick={isOwnProfile ? () => setShowPicker(true) : undefined}
          />
        ))}
        {isOwnProfile && pins.length < maxPins && (
          <button
            className="border-ink-300 hover:border-ink-400 rounded-lg border border-dashed px-2 py-1 transition-colors"
            onClick={() => setShowPicker(!showPicker)}
          >
            <span className="text-ink-400 text-xs">+ Pin</span>
          </button>
        )}
      </Row>

      {isOwnProfile && showPicker && (
        <Col className="bg-canvas-0 border-ink-200 mt-2 gap-3 rounded-xl border p-4">
          <Row className="items-center justify-between">
            <span className="text-ink-900 text-sm font-bold">
              Pin a trophy to your profile
            </span>
            <button
              className="text-ink-500 text-xs hover:underline"
              onClick={() => {
                setShowPicker(false)
                setPickerMessage(null)
              }}
            >
              Done
            </button>
          </Row>
          {badges.length === 0 ? (
            <span className="text-ink-500 text-sm">
              Claim a trophy on the Trophies tab to pin it here.
            </span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <ShowcaseBadge
                  key={b.id}
                  badge={b}
                  size="lg"
                  onClick={() => togglePin(b.id)}
                  selected={pins.includes(b.id)}
                />
              ))}
            </div>
          )}
          {pickerMessage ? (
            <span className="text-sm font-medium text-amber-600">
              {pickerMessage}
            </span>
          ) : (
            <span className="text-ink-500 text-xs">
              Select up to {maxPins}. Click a pinned trophy to remove it.
            </span>
          )}
        </Col>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

type BadgeTier = TrophyTier | 'gray'

type ShowcaseBadgeData = {
  id: string // the pin id
  label: string
  stat?: string // shown after the label, e.g. "2.3M"
  detail: string // tooltip
  emoji: string
  // A trophy's art, shown instead of the emoji.
  art?: { trophyId: string; milestone: TrophyMilestone }
  tier: BadgeTier
  rankTier?: TrophyRankTier
}

const BADGE_TIER_ORDER: BadgeTier[] = [...TROPHY_TIER_ORDER, 'gray']

const BADGE_STYLES: Record<BadgeTier, { gradient: string; text: string }> = {
  gray: {
    gradient: 'from-zinc-400 to-zinc-500',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  green: {
    gradient: 'from-emerald-400 to-emerald-600',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    gradient: 'from-sky-400 to-blue-600',
    text: 'text-blue-600 dark:text-blue-400',
  },
  purple: {
    gradient: 'from-violet-400 to-purple-600',
    text: 'text-violet-600 dark:text-violet-400',
  },
  crimson: {
    gradient: 'from-red-500 to-rose-700',
    text: 'text-red-600 dark:text-red-400',
  },
  gold: {
    gradient: 'from-amber-400 to-yellow-600',
    text: 'text-amber-600 dark:text-amber-400',
  },
  prismatic: {
    gradient: 'from-pink-400 via-cyan-400 to-yellow-400',
    text: 'bg-gradient-to-r from-pink-500 via-cyan-500 to-yellow-500 bg-clip-text text-transparent',
  },
}

const sortBadges = (badges: ShowcaseBadgeData[]) =>
  badges
    .slice()
    .sort(
      (a, b) =>
        BADGE_TIER_ORDER.indexOf(a.tier) - BADGE_TIER_ORDER.indexOf(b.tier)
    )

// Each badge shows the trophy's highest claimed milestone.
function getTrophyBadges(
  stats: TrophyStats,
  claims: TrophyClaim[],
  held: ReturnType<typeof getHeldTrophyTitles>
): ShowcaseBadgeData[] {
  return TROPHY_DEFINITIONS.flatMap((def) => {
    const milestone = getHighestClaimedMilestone(def, claims)
    if (!milestone) return []
    const stat = stats[def.statKey]
    return [
      getTrophyShowcaseBadge(
        def,
        milestone,
        Number.isFinite(stat) ? stat : undefined,
        held.find((h) => h.definition.id === def.id)
      ),
    ]
  })
}

export function getTrophyShowcaseBadge(
  def: TrophyDefinition,
  milestone: TrophyMilestone,
  stat: number | undefined,
  held?: ReturnType<typeof getHeldTrophyTitles>[number]
): ShowcaseBadgeData {
  const value = stat === undefined ? undefined : formatTrophyValue(def, stat)
  const peak = formatNetWorthPeak(def, stat, held?.value)
  return {
    id: getTrophyPinId(def.id),
    label: held
      ? `${held.title} · ${formatRankValue(def, held.value)}`
      : milestone.name,
    rankTier: held?.tier,
    stat: peak ?? (held ? undefined : value),
    detail: held
      ? `${def.label} · #${held.rank}. ${def.rankNote}`
      : value === undefined
      ? def.label
      : peak ??
        `${def.label}: ${value}${
          def.formatPrefix || def.unit === 'league' ? '' : ` ${def.unit}`
        }`,
    emoji: milestone.emoji,
    art: { trophyId: def.id, milestone },
    tier: milestone.tier,
  }
}

const LEAGUE_EMOJI: Record<number, string> = {
  0: '\u{1F4A0}',
  1: '\u{1F949}',
  2: '\u{1F948}',
  3: '\u{1F947}',
  4: '\u{2B50}',
  5: '\u{1F48E}',
  6: '\u{1F451}',
}

function leagueTier(division: number): BadgeTier {
  if (division >= 6) return 'prismatic'
  if (division >= 5) return 'gold'
  if (division >= 4) return 'purple'
  if (division >= 3) return 'blue'
  if (division >= 2) return 'green'
  return 'gray'
}

const LEAGUE_PLACEHOLDER_BADGE: ShowcaseBadgeData = {
  id: LEAGUE_SHOWCASE_PIN,
  label: 'League',
  detail: 'Your current league',
  emoji: '\u{1F3C6}',
  tier: 'gray',
}

// The current league, from Silver up.
function getLeagueBadges(
  league: Pick<League, 'season' | 'division'>,
  info: league_user_info | null | undefined
): ShowcaseBadgeData[] {
  if (league.division < 2) return []
  const divName = DIVISION_NAMES[league.division] ?? 'Unknown'
  const rank =
    info?.season === league.season && info.division === league.division
      ? `, rank #${info.rank}`
      : ''
  return [
    {
      id: LEAGUE_SHOWCASE_PIN,
      label: `${divName} S${league.season}`,
      detail: `${divName} division${rank}, season ${league.season}`,
      emoji: LEAGUE_EMOJI[league.division] ?? '\u{1F3C6}',
      tier: leagueTier(league.division),
    },
  ]
}

export function ShowcaseBadge(props: {
  badge: ShowcaseBadgeData
  onClick?: () => void
  selected?: boolean
  size?: 'sm' | 'lg'
  hideStatBelowSm?: boolean
}) {
  const { badge, onClick, selected, size = 'sm', hideStatBelowSm } = props
  const style = BADGE_STYLES[badge.tier]
  const isLarge = size === 'lg'

  const content = (
    <div className={clsx('rounded-[5px] bg-gradient-to-br', style.gradient)}>
      <Row
        className={clsx(
          'items-center gap-1.5 rounded-[4px]',
          isLarge ? 'px-3 py-2' : 'px-2 py-1'
        )}
        style={{
          background:
            'linear-gradient(135deg, rgb(var(--color-canvas-0) / 0.88), rgb(var(--color-canvas-0) / 0.94))',
        }}
      >
        {badge.art ? (
          <TrophyRankRing tier={badge.rankTier} small>
            <TrophyBadgeImage
              trophyId={badge.art.trophyId}
              milestone={badge.art.milestone}
              rankTier={badge.rankTier}
              className={isLarge ? 'h-7 w-7' : 'h-5 w-5'}
              emojiClassName={isLarge ? 'text-lg' : 'text-sm'}
            />
          </TrophyRankRing>
        ) : (
          <span className={isLarge ? 'text-lg' : 'text-sm'} aria-hidden>
            {badge.emoji}
          </span>
        )}
        <span
          className={clsx(
            'font-semibold',
            isLarge ? 'text-sm' : 'text-xs',
            style.text
          )}
        >
          {badge.label}
        </span>
        {badge.stat && (
          <span
            className={clsx(
              'text-ink-500 font-normal',
              hideStatBelowSm && 'hidden sm:inline',
              isLarge ? 'text-xs' : 'text-[10px]'
            )}
          >
            {badge.stat}
          </span>
        )}
      </Row>
    </div>
  )

  return (
    <Tooltip text={badge.detail}>
      {onClick ? (
        <button
          className={clsx(
            'relative cursor-pointer rounded-lg border p-[1.5px] transition-all hover:scale-105',
            selected
              ? 'ring-primary-500 ring-2 ring-offset-1'
              : 'border-transparent'
          )}
          onClick={onClick}
          aria-pressed={selected}
        >
          {content}
        </button>
      ) : (
        <div className="relative rounded-lg border border-transparent p-[1.5px]">
          {content}
        </div>
      )}
    </Tooltip>
  )
}
