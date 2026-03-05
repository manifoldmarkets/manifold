import Link from 'next/link'
import clsx from 'clsx'
import {
  BOT_USERNAMES,
  VERIFIED_USERNAMES,
  MVP,
  ENV_CONFIG,
  MOD_IDS,
  BEING_DEAD_HEADS,
} from 'common/envs/constants'
import { Tooltip } from './tooltip'
import { BadgeCheckIcon, ShieldCheckIcon } from '@heroicons/react/outline'
import { Row } from '../layout/row'
import { Avatar, AvatarSizeType } from './avatar'
import { DAY_MS } from 'common/util/time'
import ScalesIcon from 'web/lib/icons/scales-icon.svg'
import { linkClass } from './site-link'
import Foldy from 'web/public/logo.svg'
import { Col } from 'web/components/layout/col'
import { BsFillArrowThroughHeartFill } from 'react-icons/bs'
import { UserHovercard } from '../user/user-hovercard'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { GiBurningSkull } from 'react-icons/gi'
import { FaStar } from 'react-icons/fa'
import { User, UserBan } from 'common/user'
import { LuSprout } from 'react-icons/lu'
import { UserEntitlement } from 'common/shop/types'
import { userHasSupporterBadge, userHasCharityChampionTrophy } from 'common/shop/items'
import { FaTrophy } from 'react-icons/fa6'
import { getUserSupporterTier, SUPPORTER_TIERS } from 'common/supporter-config'
import {
  DisplayContext,
  shouldShowBadges,
  shouldAnimateBadge,
} from 'common/shop/display-config'
import { getActiveBlockingBans, getBanTypeDescription } from 'common/ban-utils'
export const isFresh = (createdTime: number) =>
  createdTime > Date.now() - DAY_MS * 14

export function shortenName(name: string, maxLength: number = 10) {
  const firstName = name.split(' ')[0]
  const shortName =
    firstName.length >= 3 && name.length > maxLength
      ? firstName.length < maxLength
        ? firstName
        : firstName.substring(0, maxLength - 3) + '...'
      : name.length > maxLength
      ? name.substring(0, maxLength - 3) + '...'
      : name
  return shortName
}

export function UserAvatarAndBadge(props: {
  user: { id: string; name?: string; username?: string; avatarUrl?: string }
  noLink?: boolean
  className?: string
  short?: boolean
  displayContext?: DisplayContext
}) {
  const { noLink, className, short, displayContext } = props
  const user = useDisplayUserById(props.user.id) ?? props.user
  const { username, avatarUrl } = user
  return (
    <UserHovercard userId={user.id}>
      <Row className={clsx('items-center gap-2', className)}>
        <Avatar
          avatarUrl={avatarUrl}
          username={username}
          size={'sm'}
          noLink={noLink}
          entitlements={
            'entitlements' in user
              ? (user.entitlements as UserEntitlement[] | undefined)
              : undefined
          }
          displayContext={displayContext}
        />
        <UserLink
          short={short}
          user={user}
          noLink={noLink}
          displayContext={displayContext}
        />
      </Row>
    </UserHovercard>
  )
}
export function UserAvatar(props: {
  user: { id: string; name?: string; username?: string; avatarUrl?: string }
  noLink?: boolean
  className?: string
  size?: AvatarSizeType
  displayContext?: DisplayContext
}) {
  const { noLink, className, size, displayContext } = props
  const user = useDisplayUserById(props.user.id) ?? props.user
  const { username, avatarUrl } = user
  return (
    <UserHovercard userId={user.id}>
      <Row className={clsx('items-center gap-2', className)}>
        <Avatar
          avatarUrl={avatarUrl}
          username={username}
          size={size}
          noLink={noLink}
          entitlements={
            'entitlements' in user
              ? (user.entitlements as UserEntitlement[] | undefined)
              : undefined
          }
          displayContext={displayContext}
        />
      </Row>
    </UserHovercard>
  )
}

export function UserLink(props: {
  user?:
    | {
        id: string
        name?: string
        username?: string
        createdTime?: number
        entitlements?: UserEntitlement[]
      }
    | undefined
    | null
  className?: string
  short?: boolean
  maxLength?: number
  noLink?: boolean
  hideBadge?: boolean
  marketCreator?: boolean
  displayContext?: DisplayContext
}) {
  const {
    user,
    className,
    short,
    maxLength,
    noLink,
    hideBadge,
    marketCreator,
    displayContext,
  } = props

  if (!user || !user.name || !user.username) {
    // skeleton
    return (
      <div className="bg-ink-100 dark:bg-ink-800 text-ink-200 dark:text-ink-400 h-5 w-20 animate-pulse rounded-full" />
    )
  }

  const { id, name, username, createdTime, entitlements } = user
  const fresh = createdTime ? isFresh(createdTime) : false
  const shortName = short ? shortenName(name, maxLength) : name
  const children = (
    <span className="inline-flex flex-row flex-nowrap items-center gap-1">
      <span className="max-w-[200px] truncate">{shortName}</span>
      {!hideBadge && (
        <UserBadge
          userId={id}
          username={username}
          fresh={fresh}
          marketCreator={marketCreator}
          entitlements={entitlements}
          displayContext={displayContext}
        />
      )}
    </span>
  )
  if (noLink) {
    return (
      <div
        className={clsx(
          'inline-flex flex-row flex-nowrap items-center gap-1',
          className
        )}
      >
        {children}
      </div>
    )
  }
  return (
    <Link
      href={`/${username}`}
      className={clsx(
        linkClass,
        'inline-flex flex-row flex-nowrap items-center gap-1',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  )
}

function BotBadge() {
  return (
    <span className="bg-ink-100 text-ink-800 ml-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium">
      Bot
    </span>
  )
}

/** @deprecated Use RestrictedBadge instead */
export function BannedBadge() {
  return (
    <Tooltip
      text="Can't create comments, messages, or questions"
      placement="bottom"
    >
      <span className="ml-1.5 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100">
        Banned
      </span>
    </Tooltip>
  )
}

// Works with full User or DisplayUser
// isBannedFromPosting is only true when ALL THREE ban types are permanently applied
// bans prop allows showing partial restrictions with details
type RestrictedBadgeUser = {
  isBannedFromPosting?: boolean
}

export function RestrictedBadge({
  user,
  bans,
}: {
  user: RestrictedBadgeUser
  bans?: UserBan[]
}) {
  // Check for granular bans first (if provided)
  const activeBanTypes = bans ? getActiveBlockingBans(bans) : []
  const hasPartialBans = activeBanTypes.length > 0 && activeBanTypes.length < 3

  // Full permanent ban (all 3 types)
  if (user.isBannedFromPosting) {
    return (
      <Tooltip
        text="Permanently banned from posting, trading, and market control"
        placement="bottom"
      >
        <span className="ml-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-700 dark:text-red-100">
          Banned
        </span>
      </Tooltip>
    )
  }

  // Partial restrictions (some but not all ban types, or temporary bans)
  if (hasPartialBans || (bans && activeBanTypes.length === 3)) {
    // Get detailed actions for each ban type and combine them into a unique list
    const allActions = activeBanTypes.flatMap((bt) =>
      getBanTypeDescription(bt).split(', ')
    )
    // Remove duplicates and join into a readable list
    const uniqueActions = [...new Set(allActions)]
    const tooltipText = `Restricted from: ${uniqueActions.join(', ')}`

    return (
      <Tooltip text={tooltipText} placement="bottom">
        <span className="ml-1.5 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100">
          Restricted
        </span>
      </Tooltip>
    )
  }

  return null
}

export function UserBadge(props: {
  userId: string
  username: string
  fresh?: boolean
  marketCreator?: boolean
  entitlements?: UserEntitlement[]
  // Filter supporter badge based on display context
  // REQUIRED for badge to show - if not provided, no badge displayed
  displayContext?: DisplayContext
}) {
  const {
    userId,
    username,
    fresh,
    marketCreator,
    entitlements,
    displayContext,
  } = props

  // Check if we should show supporter badge in this context
  // FAIL-SAFE: If no displayContext provided, show NO supporter badge
  // This ensures the config controls everything - add displayContext to enable
  const showSupporterBadge = displayContext
    ? shouldShowBadges(displayContext) && userHasSupporterBadge(entitlements)
    : false

  // Get animation setting from config
  const animateSupporterBadge = displayContext
    ? shouldAnimateBadge(displayContext)
    : false

  const badges = []
  if (BOT_USERNAMES.includes(username)) {
    badges.push(<BotBadge key="bot" />)
  }
  if (ENV_CONFIG.adminIds.includes(userId)) {
    badges.push(<CoreBadge key="core" />)
  }
  if (MOD_IDS.includes(userId)) {
    badges.push(<ModBadge key="mod" />)
  }
  if (MVP.includes(username)) {
    badges.push(<MVPBadge key="mvp" />)
  }
  if (VERIFIED_USERNAMES.includes(username)) {
    badges.push(<VerifiedBadge key="check" />)
  }
  if (BEING_DEAD_HEADS.includes(userId)) {
    badges.push(<BeingDeadHead key="being-dead" />)
  }
  if (showSupporterBadge) {
    badges.push(
      <SupporterBadge
        key="supporter"
        entitlements={entitlements}
        animate={animateSupporterBadge}
      />
    )
  }
  // Show charity champion trophy if user has it enabled
  if (userHasCharityChampionTrophy(entitlements)) {
    badges.push(<CharityChampionBadge key="charity-champion" />)
  }
  if (fresh) {
    badges.push(<FreshBadge key="fresh" />)
  }
  if (marketCreator) {
    badges.push(<MarketCreatorBadge key="creator" />)
  }
  return <>{badges}</>
}

// Show a special checkmark next to Core team members
function CoreBadge() {
  return (
    <Tooltip text="I work on Manifold!" placement="right">
      <Foldy
        className="stoke-indigo-700 h-4 w-4 stroke-1 hover:rotate-12 dark:stroke-indigo-300"
        aria-hidden
      />
    </Tooltip>
  )
}

// Show a normal checkmark next to our mods
function ModBadge() {
  return (
    <Tooltip text="Moderator" placement="right">
      <ShieldCheckIcon
        className="h-4 w-4 text-purple-700 dark:text-purple-400"
        aria-hidden="true"
      />
    </Tooltip>
  )
}
function MVPBadge() {
  return (
    <Tooltip text="MVP" placement="right">
      <BsFillArrowThroughHeartFill
        className="h-4 w-4 text-purple-700 dark:text-purple-400"
        aria-hidden="true"
      />
    </Tooltip>
  )
}

// Show a normal checkmark next to our verified users
function VerifiedBadge() {
  return (
    <Tooltip text="Verified" placement="right">
      <BadgeCheckIcon className="text-primary-700 h-4 w-4" aria-hidden />
    </Tooltip>
  )
}

function BeingDeadHead() {
  return (
    <Tooltip text="Being Dead head (the band)" placement="right">
      <GiBurningSkull className="text-primary-700 h-3.5 w-3.5" aria-hidden />
    </Tooltip>
  )
}

// Show a fresh badge next to new users
function FreshBadge() {
  return (
    <Tooltip text="I'm new here!" placement="right">
      <LuSprout className="h-4 w-4 text-green-500" aria-hidden="true" />
    </Tooltip>
  )
}

function MarketCreatorBadge() {
  return (
    <Tooltip text="Question Creator" placement="right">
      <ScalesIcon className="h-4 w-4 text-amber-400" aria-hidden="true" />
    </Tooltip>
  )
}

// Show a star for Manifold Supporters with tier-appropriate color
// Note: Premium animation only appears on hovercard, not inline
function SupporterBadge({
  entitlements,
  animate,
}: {
  entitlements?: UserEntitlement[]
  animate?: boolean
}) {
  const tier = getUserSupporterTier(entitlements)
  if (!tier) return null

  const tierConfig = SUPPORTER_TIERS[tier]
  const showAnimation = animate && tier === 'premium'

  return (
    <Tooltip text={`Manifold ${tierConfig.name}`} placement="right">
      <span className="relative inline-flex translate-y-[1px] items-center">
        <FaStar
          className={clsx(
            'h-4 w-4',
            tier === 'basic' && 'text-gray-400',
            tier === 'plus' && 'text-indigo-500',
            tier === 'premium' && 'text-amber-500'
          )}
          aria-hidden="true"
          style={
            tier === 'premium'
              ? { filter: 'drop-shadow(0 0 2px rgba(245, 158, 11, 0.5))' }
              : undefined
          }
        />
        {showAnimation && (
          <FaStar
            className="absolute inset-0 h-4 w-4 animate-pulse text-amber-500 opacity-50 blur-[1px]"
            aria-hidden="true"
          />
        )}
      </span>
    </Tooltip>
  )
}

// Show a trophy for the current Charity Champion
function CharityChampionBadge() {
  return (
    <Tooltip text="Charity Champion" placement="right">
      <FaTrophy
        className="h-4 w-4 text-amber-500"
        aria-hidden="true"
        style={{ filter: 'drop-shadow(0 0 2px rgba(245, 158, 11, 0.4))' }}
      />
    </Tooltip>
  )
}

export const StackedUserNames = (props: {
  user: User
  followsYou?: boolean
  className?: string
  usernameClassName?: string
  displayContext?: DisplayContext
  bans?: UserBan[]
}) => {
  const {
    user,
    followsYou,
    usernameClassName,
    className,
    displayContext,
    bans,
  } = props
  // Check for any active bans - use granular bans if available, else fall back to legacy field
  const activeBanTypes = bans ? getActiveBlockingBans(bans) : []
  const hasAnyBan = activeBanTypes.length > 0 || !!user.isBannedFromPosting

  return (
    <Col>
      <div className={'inline-flex flex-row items-center gap-1 pt-1'}>
        <span className={clsx('break-anywhere ', className)}>{user.name}</span>
        {
          <UserBadge
            userId={user.id}
            username={user.username}
            fresh={user.createdTime ? isFresh(user.createdTime) : false}
            entitlements={user.entitlements}
            displayContext={displayContext}
          />
        }
        {user.userDeleted ? (
          <span className="ml-1.5 rounded-full bg-yellow-100 px-2.5 py-0.5 text-center text-xs font-medium text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100">
            Deleted account
          </span>
        ) : hasAnyBan ? (
          <RestrictedBadge user={user} bans={bans} />
        ) : null}
      </div>
      <Row className={'flex-shrink flex-wrap gap-x-2'}>
        <span className={clsx('text-ink-400 text-sm', usernameClassName)}>
          @{user.username}{' '}
        </span>
        {followsYou && (
          <span
            className={
              'bg-ink-200 w-fit self-center rounded-md p-0.5 px-1 text-xs'
            }
          >
            Follows you
          </span>
        )}
      </Row>
    </Col>
  )
}
