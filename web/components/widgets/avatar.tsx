import Router from 'next/router'
import clsx from 'clsx'
import { memo, MouseEvent, useEffect, useState } from 'react'
import { UserCircleIcon, UserIcon, UsersIcon } from '@heroicons/react/solid'
import Image from 'next/image'
import { floor } from 'lodash'
import { isFresh } from './user-link'
import { LuSprout, LuCrown, LuGraduationCap } from 'react-icons/lu'
import { GiTopHat, GiDunceCap } from 'react-icons/gi'
import { UserEntitlement } from 'common/shop/types'
import {
  userHasAvatarDecoration,
  getActiveAvatarOverlay,
  getActiveAvatarAccessory,
  AvatarDecorationId,
} from 'common/shop/items'
import {
  DisplayContext,
  filterEntitlementsForContext,
  shouldAnimateHatOnHover,
  shouldAnimateGoldenGlow,
  shouldAnimatePropeller,
} from 'common/shop/display-config'

export type AvatarSizeType = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export const Avatar = memo(
  (props: {
    username?: string
    avatarUrl?: string
    noLink?: boolean
    size?: AvatarSizeType
    className?: string
    preventDefault?: boolean
    createdTime?: number
    entitlements?: UserEntitlement[]
    // Filter entitlements based on display context
    // REQUIRED for entitlements to show - if not provided, no entitlements displayed
    displayContext?: DisplayContext
    // Direct control for hat animation (for mobile expand/collapse on profile page)
    animateHat?: boolean
  }) => {
    const {
      username,
      noLink,
      size,
      className,
      preventDefault,
      createdTime,
      entitlements: rawEntitlements,
      displayContext,
      animateHat,
    } = props

    // Get animation settings from config (based on displayContext)
    const animateHatOnHover = displayContext
      ? shouldAnimateHatOnHover(displayContext)
      : false
    const animateGoldenGlow = displayContext
      ? shouldAnimateGoldenGlow(displayContext)
      : false
    const animatePropeller = displayContext
      ? shouldAnimatePropeller(displayContext)
      : false

    // Filter entitlements based on display context
    // FAIL-SAFE: If no displayContext provided, show NO entitlements
    // This ensures the config controls everything - add displayContext to enable
    const entitlements = displayContext
      ? filterEntitlementsForContext(rawEntitlements, displayContext)
      : undefined
    const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl)
    useEffect(() => setAvatarUrl(props.avatarUrl), [props.avatarUrl])

    // Check for avatar decorations
    const hasGoldenBorder = userHasAvatarDecoration(
      entitlements,
      'avatar-golden-border'
    )
    const hasAngelWings = userHasAvatarDecoration(
      entitlements,
      'avatar-angel-wings'
    )
    const hasManaAura = userHasAvatarDecoration(
      entitlements,
      'avatar-mana-aura'
    )
    const hasBlackHole = userHasAvatarDecoration(
      entitlements,
      'avatar-black-hole'
    )
    const hasFireRing = userHasAvatarDecoration(
      entitlements,
      'avatar-fire-ring'
    )
    const hasBadAura = userHasAvatarDecoration(entitlements, 'avatar-bad-aura')
    // Get active avatar overlay (hat)
    const activeOverlay = getActiveAvatarOverlay(entitlements)
    // Get active avatar accessory
    const activeAccessory = getActiveAvatarAccessory(entitlements)
    const s =
      size == '2xs'
        ? 4
        : size == 'xs'
        ? 6
        : size == 'sm'
        ? 8
        : size == 'md'
        ? 10
        : size == 'lg'
        ? 12
        : size == 'xl'
        ? 24
        : 10
    const sizeInPx = s * 4

    const isUserFresh = createdTime ? isFresh(createdTime) : false

    // Check if the avatar URL is a GIF (potentially animated) and exclude it
    const isAnimatedFormat = avatarUrl?.toLowerCase().match(/\.gif(\?|$)/)
    const shouldShowImage = avatarUrl && !isAnimatedFormat

    const onClick = (e: MouseEvent) => {
      if (!noLink && username) {
        if (preventDefault) {
          e.preventDefault()
        }
        e.stopPropagation()
        Router.push(`/${username}`)
      }
    }

    // Determine if we need a relative wrapper for overlays
    const needsRelativeWrapper =
      isUserFresh ||
      activeOverlay ||
      activeAccessory ||
      hasGoldenBorder ||
      hasAngelWings ||
      hasManaAura ||
      hasBlackHole ||
      hasFireRing ||
      hasBadAura

    // there can be no avatar URL or username in the feed, we show a "submit comment"
    // item with a fake grey user circle guy even if you aren't signed in
    const hasHat = !!activeOverlay

    // Scale hat/overlay icons based on avatar size
    const hatSizeClass =
      size === '2xs' || size === 'xs'
        ? 'h-3 w-3'
        : size === 'sm'
        ? 'h-4 w-4'
        : 'h-5 w-5'

    // Scale position offset based on avatar size
    // For small avatars, position hat more towards top-right corner to avoid golden glow overlap
    const hatPositionClass =
      size === '2xs' || size === 'xs'
        ? '-right-1.5 -top-1.5'
        : size === 'sm'
        ? '-right-1.5 -top-2'
        : '-right-2 -top-[0.41rem]'

    return (
      <div
        className={clsx(
          needsRelativeWrapper && 'relative',
          // Constrain to content size to prevent glow from stretching in flex containers
          needsRelativeWrapper && 'h-fit w-fit'
          // Note: parent element must have 'group' class for animateHatOnHover to work
        )}
      >
        {/* Golden border glow effect - only animate when explicitly enabled */}
        {hasGoldenBorder && (
          <div
            className={clsx(
              'absolute -inset-1 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 opacity-75 blur-sm',
              animateGoldenGlow && 'animate-pulse'
            )}
          />
        )}
        {/* Bad aura - crimson red glow (dark version of golden glow) */}
        {hasBadAura && (
          <div
            className={clsx(
              'absolute -inset-1 rounded-full bg-gradient-to-r from-red-600 via-red-500 to-red-600 opacity-75 blur-sm',
              animateGoldenGlow && 'animate-pulse'
            )}
          />
        )}
        {/* Mana aura - purple/blue mystical energy */}
        {hasManaAura && (
          <div
            className={clsx(
              'absolute -inset-1.5 rounded-full opacity-80 blur-md',
              animateGoldenGlow && 'animate-pulse'
            )}
            style={{
              background:
                'radial-gradient(circle, rgba(139,92,246,0.6) 0%, rgba(59,130,246,0.4) 50%, rgba(139,92,246,0.2) 100%)',
            }}
          />
        )}
        {/* Black hole - dark swirling void */}
        {hasBlackHole && <BlackHoleDecoration size={size} />}
        {/* Fire ring - blazing ring of fire */}
        {hasFireRing && <FireRingDecoration size={size} />}
        {/* Angel wings - feathered wings flanking avatar */}
        {hasAngelWings && <AngelWingsDecoration size={size} />}
        {shouldShowImage ? (
          <Image
            width={sizeInPx}
            height={sizeInPx}
            className={clsx(
              'bg-canvas-0 my-0 flex-shrink-0 rounded-full object-cover',
              `w-${s} h-${s}`,
              !noLink && 'cursor-pointer',
              className,
              isUserFresh && 'ring-1 ring-green-500',
              hasGoldenBorder && 'relative ring-2 ring-amber-400',
              hasBadAura && 'relative ring-2 ring-red-500',
              hasManaAura && 'relative ring-2 ring-violet-400',
              hasFireRing && 'relative ring-2 ring-orange-400',
              hasBlackHole && 'relative ring-2 ring-purple-900'
            )}
            style={{ maxWidth: `${s * 0.25}rem` }}
            src={avatarUrl}
            onClick={onClick}
            alt={`${username ?? 'Unknown user'} avatar`}
            onError={() => {
              // If the image doesn't load, clear the avatarUrl to show the default
              // Mostly for localhost, when getting a 403 from googleusercontent
              setAvatarUrl('')
            }}
          />
        ) : (
          <UserCircleIcon
            className={clsx(
              `bg-canvas-0 flex-shrink-0 rounded-full w-${s} h-${s} text-ink-500`,
              className,
              isUserFresh && 'ring-1 ring-green-500',
              hasGoldenBorder && 'relative ring-2 ring-amber-400',
              hasBadAura && 'relative ring-2 ring-red-500',
              hasManaAura && 'relative ring-2 ring-violet-400',
              hasFireRing && 'relative ring-2 ring-orange-400',
              hasBlackHole && 'relative ring-2 ring-purple-900'
            )}
            onClick={onClick}
          />
        )}
        {/* Fresh user sprout */}
        {isUserFresh && (
          <div className="absolute -right-2 -top-[0.41rem] rotate-45">
            <LuSprout className="h-4 w-4 text-green-500" />
          </div>
        )}
        {/* Avatar overlay (hat) */}
        {activeOverlay && (
          <AvatarOverlay
            overlay={activeOverlay}
            hatSizeClass={hatSizeClass}
            hatPositionClass={hatPositionClass}
            animateHatOnHover={animateHatOnHover}
            animateHat={animateHat}
            animatePropeller={animatePropeller}
            size={size}
          />
        )}
        {/* Avatar accessory */}
        {activeAccessory && (
          <AvatarAccessory accessory={activeAccessory} size={size} />
        )}
      </div>
    )
  }
)

// Angel wings decoration - flanks the avatar on both sides
function AngelWingsDecoration(props: { size?: AvatarSizeType }) {
  const { size } = props
  const wingW = size === '2xs' || size === 'xs' ? 6 : size === 'sm' ? 9 : 12
  const wingH = size === '2xs' || size === 'xs' ? 16 : size === 'sm' ? 26 : 36
  const offset = size === '2xs' || size === 'xs' ? -3 : size === 'sm' ? -5 : -7

  // Layered feather wing - tall and narrow, 4 tiers
  const wingSvg = (
    <>
      {/* Flight feathers (back layer) - Longest, reaching bottom */}
      <path
        d="M16 12 C 10.5 2 3.5 4 2.5 12 C 2.1 18 2.1 24 2.5 28 L 4.5 29 L 3.5 36 L 7 38 L 6 44 C 11 40 15 32 16 22 Z"
        fill="#FFFFFF"
        stroke="#CBD5E1"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      {/* Secondary feathers - Mid length */}
      <path
        d="M16 13 C 11.5 5 6 6 5 13 C 4.5 18 5 21 6 25 C 10 23 13.5 22 16 20 Z"
        fill="#E2E8F0"
      />
      {/* Tertiary feathers - Shorter inner layer */}
      <path
        d="M16 13 C 12.5 7 8.5 8 7.5 13 C 7.5 16 8 18.5 9 21 C 12 19.5 14.5 19 16 18 Z"
        fill="#E5E7EB"
      />
      {/* Shoulder coverts (front layer) - Top rounded section */}
      <path
        d="M16 13 C 14.2 9.5 11.5 9.5 10.5 12 C 10.5 14 11 15.5 12 17 C 13.5 16.5 15 16.5 16 16 Z"
        fill="#F1F5F9"
      />
    </>
  )

  return (
    <>
      {/* Left wing */}
      <svg
        className="absolute top-1/2 -translate-y-1/2"
        style={{ left: offset, width: wingW, height: wingH, opacity: 0.9 }}
        viewBox="0 0 16 44"
      >
        {wingSvg}
      </svg>
      {/* Right wing (mirrored) */}
      <svg
        className="absolute top-1/2"
        style={{
          right: offset,
          width: wingW,
          height: wingH,
          opacity: 0.9,
          transform: 'translateY(-50%) scaleX(-1)',
        }}
        viewBox="0 0 16 44"
      >
        {wingSvg}
      </svg>
    </>
  )
}

// Black hole decoration - dark swirling void with accretion disk
function BlackHoleDecoration(props: { size?: AvatarSizeType }) {
  const { size } = props
  const bhSize =
    size === '2xs' || size === 'xs' ? 24 : size === 'sm' ? 36 : 48
  const offset =
    size === '2xs' || size === 'xs' ? -4 : size === 'sm' ? -6 : -8

  return (
    <svg
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: bhSize, height: bhSize, marginLeft: offset / 2, marginTop: offset / 2 }}
      viewBox="0 0 48 48"
    >
      <defs>
        <radialGradient id="bh-accretion-glow" cx="24" cy="24" r="24" gradientUnits="userSpaceOnUse">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="85%" stopColor="#4b0082" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bh-inner-shadow" cx="24" cy="24" r="20" gradientUnits="userSpaceOnUse">
          <stop offset="70%" stopColor="#000" stopOpacity="0" />
          <stop offset="85%" stopColor="#000" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#000" stopOpacity="1" />
        </radialGradient>
      </defs>
      {/* Outer purple haze */}
      <circle cx="24" cy="24" r="23" fill="url(#bh-accretion-glow)" />
      {/* Swirling fragments */}
      <path d="M24 3C35.0457 3 45 11.9543 45 24" stroke="#2d004d" strokeWidth="5" fill="none" opacity="0.7" strokeLinecap="round" />
      <path d="M45 24C45 36.0457 35.0457 45 24 45" stroke="#4b0082" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
      <path d="M24 45C11.9543 45 3 36.0457 3 24" stroke="#1a0033" strokeWidth="6" fill="none" opacity="0.8" strokeLinecap="round" />
      <path d="M3 24C3 11.9543 11.9543 3 24 3" stroke="#6a0dad" strokeWidth="2" fill="none" opacity="0.4" strokeLinecap="round" />
      {/* Spiral wisps */}
      <path d="M24 7 A17 17 0 0 1 41 24" stroke="#9333ea" strokeWidth="1.5" fill="none" opacity="0.3" strokeDasharray="4 2" />
      <path d="M7 24 A17 17 0 0 1 24 41" stroke="#9333ea" strokeWidth="1.5" fill="none" opacity="0.3" strokeDasharray="4 2" />
      {/* Event Horizon shadow */}
      <circle cx="24" cy="24" r="18" fill="none" stroke="url(#bh-inner-shadow)" strokeWidth="4" />
      {/* Infalling particles */}
      <circle cx="38" cy="12" r="0.6" fill="#fff" opacity="0.9" />
      <circle cx="10" cy="36" r="0.4" fill="#ba55d3" opacity="0.7" />
      <circle cx="26" cy="44" r="0.5" fill="#fff" opacity="0.8" />
      <circle cx="8" cy="18" r="0.3" fill="#e0aaff" opacity="0.6" />
      <circle cx="42" cy="32" r="0.4" fill="#fff" opacity="0.7" />
      <circle cx="18" cy="6" r="0.5" fill="#ba55d3" opacity="0.5" />
    </svg>
  )
}

// Fire ring decoration - swirling flames around avatar
function FireRingDecoration(props: { size?: AvatarSizeType }) {
  const { size } = props
  const flameSize =
    size === '2xs' || size === 'xs' ? 24 : size === 'sm' ? 36 : 48
  const offset =
    size === '2xs' || size === 'xs' ? -4 : size === 'sm' ? -6 : -8

  return (
    <svg
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: flameSize, height: flameSize, marginLeft: offset / 2, marginTop: offset / 2 }}
      viewBox="0 0 48 48"
    >
      <defs>
        <linearGradient id="fire-grad-red" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="50%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
        <linearGradient id="fire-grad-orange" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c2410c" />
          <stop offset="100%" stopColor="#fb923c" />
        </linearGradient>
        <linearGradient id="fire-grad-yellow" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#fef08a" />
        </linearGradient>
        <filter id="fire-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Base Dark/Red Swirl */}
      <path
        d="M24 46 C11.8 46 2 36.2 2 24 C2 13 9.5 3.8 20 2.4 C18 5 17 8 18 11 C19 14 22 16 24 16 C26 16 28 14 29 11 C31 7 34 4 38 6 C43 9 46 16 46 24 C46 36.2 36.2 46 24 46 Z M24 44 C34 44 42 36 42 26 C42 20 38 16 34 14 C32 16 30 20 28 22 C26 24 22 24 20 22 C18 20 16 16 14 14 C10 16 6 20 6 26 C6 36 14 44 24 44 Z"
        fill="url(#fire-grad-red)"
        opacity="0.9"
      />
      {/* Main Orange Swirling Flames */}
      <path
        d="M24 42 C30 42 36 38 38 32 C39 29 37 26 35 24 C33 22 32 20 32 18 C32 15 34 12 36 10 C34 9 32 8 30 8 C27 8 25 10 24 12 C23 10 21 8 18 8 C16 8 14 9 12 10 C14 12 16 15 16 18 C16 20 15 22 13 24 C11 26 9 29 10 32 C12 38 18 42 24 42 Z"
        fill="url(#fire-grad-orange)"
        filter="url(#fire-glow)"
      />
      {/* Inner Yellow Highlights */}
      <path
        d="M24 40 C28 40 32 37 33 33 C33.5 31 32 29 31 27 C30 25 29 23 29 21 C29 19 30 17 31 15 C28 15 26 16 24 18 C22 16 20 15 17 15 C18 17 19 19 19 21 C19 23 18 25 17 27 C16 29 14.5 31 15 33 C16 37 20 40 24 40 Z"
        fill="url(#fire-grad-yellow)"
        opacity="0.9"
      />
      {/* Swirl Accents */}
      <path d="M10 24 C10 24 8 20 9 17 C9.5 15.5 11 14 11 14 C11 14 10 16 10.5 18 C11 20 13 22 13 22" stroke="url(#fire-grad-orange)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M38 24 C38 24 40 20 39 17 C38.5 15.5 37 14 37 14 C37 14 38 16 37.5 18 C37 20 35 22 35 22" stroke="url(#fire-grad-orange)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Top flame tongue */}
      <path d="M24 8 C24 8 22 6 21 4 C20.5 3 21 2 21 2 C21 2 22 3 22.5 4 C23 5 24 6 24 6 C24 6 25 5 25.5 4 C26 3 27 2 27 2 C27 2 27.5 3 27 4 C26 6 24 8 24 8" fill="url(#fire-grad-yellow)" />
    </svg>
  )
}

// Component to render avatar overlays (hats)
function AvatarOverlay(props: {
  overlay: AvatarDecorationId
  hatSizeClass: string
  hatPositionClass: string
  animateHatOnHover: boolean
  animateHat?: boolean
  animatePropeller?: boolean
  size?: AvatarSizeType
}) {
  const {
    overlay,
    hatSizeClass,
    hatPositionClass,
    animateHatOnHover,
    animateHat,
    animatePropeller,
    size,
  } = props

  // Corner position (for crown, graduation cap, microphone - sits at top-right)
  const cornerClasses = clsx(
    'absolute transition-transform duration-300',
    hatPositionClass,
    'rotate-45',
    animateHatOnHover && 'group-hover:-translate-y-0.5 group-hover:scale-110',
    animateHat && '-translate-y-0.5 scale-110'
  )

  // Centered above avatar (for top hat, propeller hat, wizard hat, tinfoil hat)
  const centeredClasses = clsx(
    'absolute left-1/2 -translate-x-1/2 transition-transform duration-300',
    size === '2xs' || size === 'xs'
      ? '-top-1.5'
      : size === 'sm'
      ? '-top-2'
      : '-top-2.5',
    animateHatOnHover && 'group-hover:-translate-y-0.5 group-hover:scale-110',
    animateHat && '-translate-y-0.5 scale-110'
  )

  switch (overlay) {
    case 'avatar-crown':
      return (
        <div className={cornerClasses}>
          <LuCrown
            className={clsx(hatSizeClass, 'text-amber-500')}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          />
        </div>
      )
    case 'avatar-graduation-cap':
      return (
        <div className={cornerClasses}>
          <LuGraduationCap className={clsx(hatSizeClass, 'text-indigo-500')} />
        </div>
      )
    case 'avatar-top-hat':
      return (
        <div className={centeredClasses}>
          {/* Light mode */}
          <GiTopHat
            className={clsx(hatSizeClass, 'text-gray-800 dark:hidden')}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          />
          {/* Dark mode - black with white outline */}
          <GiTopHat
            className={clsx(hatSizeClass, 'hidden text-gray-900 dark:block')}
            style={{
              filter: 'drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)',
            }}
          />
        </div>
      )
    case 'avatar-halo': {
      // Oblong elliptical halo - amber in light mode, white-gold in dark mode
      const haloW =
        size === '2xs' || size === 'xs'
          ? '1.25rem'
          : size === 'sm'
          ? '1.75rem'
          : '2.5rem'
      const haloH =
        size === '2xs' || size === 'xs'
          ? '0.4rem'
          : size === 'sm'
          ? '0.5rem'
          : '0.6rem'
      return (
        <div
          className={clsx(
            'absolute left-1/2 -translate-x-1/2 transition-transform duration-300',
            size === '2xs' || size === 'xs'
              ? '-top-0.5'
              : size === 'sm'
              ? '-top-1'
              : '-top-1.5',
            animateHatOnHover && 'group-hover:-translate-y-0.5',
            animateHat && '-translate-y-0.5'
          )}
        >
          {/* Light mode - amber gold visible against light backgrounds */}
          <div
            className="dark:hidden"
            style={{
              width: haloW,
              height: haloH,
              borderRadius: '50%',
              transform: 'rotate(-8deg)',
              border: '2px solid rgba(245, 158, 11, 0.9)',
              boxShadow:
                '0 0 6px rgba(245, 158, 11, 0.5), 0 0 2px rgba(217, 119, 6, 0.8)',
            }}
          />
          {/* Dark mode - white-gold glow visible against dark backgrounds */}
          <div
            className="hidden dark:block"
            style={{
              width: haloW,
              height: haloH,
              borderRadius: '50%',
              transform: 'rotate(-8deg)',
              border: '1.5px solid rgba(255, 250, 220, 0.95)',
              boxShadow:
                '0 0 6px rgba(255, 255, 255, 0.8), 0 0 12px rgba(255, 255, 200, 0.4)',
            }}
          />
        </div>
      )
    }
    case 'avatar-propeller-hat': {
      // Propeller hat - seated closer to avatar than other corner hats
      const propellerPositionClass =
        size === '2xs' || size === 'xs'
          ? '-right-0.5 -top-0.5'
          : size === 'sm'
          ? '-right-1 -top-0.5'
          : '-right-1 top-0'
      const propellerClasses = clsx(
        'absolute transition-transform duration-300',
        propellerPositionClass,
        'rotate-45',
        animateHatOnHover &&
          'group-hover:-translate-y-0.5 group-hover:scale-110',
        animateHat && '-translate-y-0.5 scale-110'
      )
      return (
        <div className={propellerClasses}>
          <div className="relative flex flex-col items-center">
            {/* Beanie dome */}
            <div
              className={clsx(
                'rounded-t-full bg-red-500',
                size === '2xs' || size === 'xs'
                  ? 'h-1.5 w-3'
                  : size === 'sm'
                  ? 'h-2 w-4'
                  : 'h-2.5 w-5'
              )}
            />
            {/* Propeller blades - positioned to overlap beanie top */}
            <div
              className="absolute"
              style={{
                top:
                  size === '2xs' || size === 'xs'
                    ? -5
                    : size === 'sm'
                    ? -6
                    : -8,
                left: '50%',
                transform: 'translateX(-50%)',
                ...(animatePropeller ? { perspective: '80px' } : {}),
              }}
            >
              <div
                style={
                  animatePropeller ? { transform: 'rotateX(50deg)' } : undefined
                }
              >
                <svg
                  width={
                    size === '2xs' || size === 'xs'
                      ? 10
                      : size === 'sm'
                      ? 12
                      : 16
                  }
                  height={
                    size === '2xs' || size === 'xs'
                      ? 10
                      : size === 'sm'
                      ? 12
                      : 16
                  }
                  viewBox="0 0 18 18"
                  className={clsx(animatePropeller && 'animate-spin')}
                  style={
                    animatePropeller ? { animationDuration: '0.5s' } : undefined
                  }
                >
                  <rect
                    x="1"
                    y="7.5"
                    width="6.5"
                    height="3"
                    rx="1.5"
                    fill="#3B82F6"
                  />
                  <rect
                    x="10.5"
                    y="7.5"
                    width="6.5"
                    height="3"
                    rx="1.5"
                    fill="#EF4444"
                  />
                  <circle cx="9" cy="9" r="2.5" fill="#FBBF24" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )
    }
    case 'avatar-wizard-hat':
      return (
        <div className={cornerClasses}>
          <svg
            viewBox="0 0 24 24"
            className={clsx(hatSizeClass)}
            style={{ filter: 'drop-shadow(0 0 3px rgba(139, 92, 246, 0.5))' }}
          >
            <ellipse cx="12" cy="19" rx="11" ry="3.5" fill="#6D28D9" />
            <polygon points="12,1 5,19 19,19" fill="#8B5CF6" />
            <circle cx="11" cy="12" r="1.2" fill="#FBBF24" opacity="0.9" />
          </svg>
        </div>
      )
    case 'avatar-tinfoil-hat':
      return (
        <div className={cornerClasses}>
          <svg
            viewBox="0 0 24 24"
            className={clsx(hatSizeClass)}
            style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}
          >
            <path d="M10 2L6 8 4 14 3 20h18l-2-7-2-6-3-4z" fill="#94A3B8" />
            <path
              d="M10 2l2 11-4 7"
              stroke="#CBD5E1"
              strokeWidth="1"
              fill="none"
              opacity="0.5"
            />
            <path
              d="M14 3l-1 12 4 5"
              stroke="#CBD5E1"
              strokeWidth="0.8"
              fill="none"
              opacity="0.4"
            />
            <line
              x1="3"
              y1="20"
              x2="21"
              y2="20"
              stroke="#64748B"
              strokeWidth="0.8"
            />
          </svg>
        </div>
      )
    case 'avatar-microphone':
      return (
        <div className={cornerClasses}>
          {/* Light mode */}
          <GiDunceCap
            className={clsx(hatSizeClass, 'text-gray-900 dark:hidden')}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          />
          {/* Dark mode - black with white outline */}
          <GiDunceCap
            className={clsx(hatSizeClass, 'hidden text-gray-900 dark:block')}
            style={{
              filter: 'drop-shadow(0 0 1px white) drop-shadow(0 0 1px white)',
            }}
          />
        </div>
      )
    case 'avatar-jester-hat':
      return (
        <div className={cornerClasses}>
          <svg
            viewBox="0 0 24 24"
            className={clsx(hatSizeClass)}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          >
            {/* Right Flap (Green) */}
            <path d="M12 21L15 13L22 6L12 21Z" fill="#16A34A" />
            <path d="M12 21L22 6L19 16L12 21Z" fill="#14532D" />
            {/* Left Flap (Indigo) - neck + beak */}
            <path d="M12 21L9 13L5 7L12 21Z" fill="#3730A3" />
            <path d="M12 21L5 7L5 16L12 21Z" fill="#312E81" />
            <path d="M5 7L5 10L2 6L5 7Z" fill="#4338CA" />
            {/* Center Flap (Red) - foreground */}
            <path d="M12 21L9 13L12 2L12 21Z" fill="#991B1B" />
            <path d="M12 21L15 13L12 2L12 21Z" fill="#DC2626" />
            {/* Gold Bells */}
            <circle cx="2" cy="6" r="1.5" fill="#FBBF24" />
            <circle cx="22" cy="6" r="1.5" fill="#FBBF24" />
            <circle cx="12" cy="2" r="1.5" fill="#FBBF24" />
          </svg>
        </div>
      )
    case 'avatar-fedora': {
      return (
        <div className={cornerClasses}>
          <svg
            viewBox="0 0 24 24"
            className={clsx(hatSizeClass)}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          >
            {/* Crown */}
            <path d="M6 16 Q6 8 12 8 Q18 8 18 16Z" fill="#78716C" />
            {/* Indent/crease */}
            <path
              d="M8 14 Q12 10 16 14"
              stroke="#57534E"
              strokeWidth="0.8"
              fill="none"
            />
            {/* Brim - wider than crown */}
            <ellipse cx="12" cy="16" rx="11" ry="3" fill="#78716C" />
            {/* Band */}
            <rect
              x="6"
              y="14"
              width="12"
              height="1.5"
              rx="0.5"
              fill="#44403C"
            />
          </svg>
        </div>
      )
    }
    case 'avatar-devil-horns': {
      const hornSize =
        size === '2xs' || size === 'xs' ? 8 : size === 'sm' ? 10 : 12
      return (
        <>
          {/* Left horn (swapped + tilted outward) */}
          <svg
            className={clsx(
              'absolute transition-transform duration-300',
              animateHatOnHover &&
                'group-hover:-translate-y-0.5 group-hover:scale-110',
              animateHat && '-translate-y-0.5 scale-110'
            )}
            style={{
              left:
                size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -2 : -3,
              top:
                size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
              width: hornSize,
              height: hornSize,
              filter: 'drop-shadow(0 0 2px rgba(220, 38, 38, 0.5))',
              transform: 'rotate(-45deg)',
            }}
            viewBox="0 0 16 16"
          >
            <path d="M0 16C0 8 8 2 14 1C11 4 6 12 5 16H0Z" fill="#DC2626" />
            <path d="M5 16C6 12 11 4 14 1C10 6 6 12 5 16Z" fill="#991B1B" />
          </svg>
          {/* Right horn (swapped + tilted outward) */}
          <svg
            className={clsx(
              'absolute transition-transform duration-300',
              animateHatOnHover &&
                'group-hover:-translate-y-0.5 group-hover:scale-110',
              animateHat && '-translate-y-0.5 scale-110'
            )}
            style={{
              right:
                size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -2 : -3,
              top:
                size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
              width: hornSize,
              height: hornSize,
              filter: 'drop-shadow(0 0 2px rgba(220, 38, 38, 0.5))',
              transform: 'rotate(45deg)',
            }}
            viewBox="0 0 16 16"
          >
            <path d="M16 16C16 8 8 2 2 1C5 4 10 12 11 16H16Z" fill="#DC2626" />
            <path d="M11 16C10 12 5 4 2 1C6 6 10 12 11 16Z" fill="#991B1B" />
          </svg>
        </>
      )
    }
    default:
      return null
  }
}

// Component to render avatar accessories (monocle, crystal ball, thought bubbles, stonks)
function AvatarAccessory(props: {
  accessory: AvatarDecorationId
  size?: AvatarSizeType
}) {
  const { accessory, size } = props

  // Scale sizes based on avatar size
  const iconSize =
    size === '2xs' || size === 'xs' ? 8 : size === 'sm' ? 10 : 14

  switch (accessory) {
    case 'avatar-monocle': {
      // Monocle centered on the avatar, overlapping the eye area
      const monocleSize =
        size === '2xs' || size === 'xs' ? 12 : size === 'sm' ? 16 : 22
      return (
        <svg
          className="absolute left-1/2 top-1/2"
          style={{
            marginLeft:
              size === '2xs' || size === 'xs' ? 1 : size === 'sm' ? 2 : 3,
            marginTop:
              size === '2xs' || size === 'xs' ? -4 : size === 'sm' ? -5 : -7,
            width: monocleSize,
            height: monocleSize,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
          viewBox="0 0 24 24"
        >
          {/* Monocle frame - thick gold ring */}
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="rgba(255,255,255,0.1)"
            stroke="#D4AF37"
            strokeWidth="2.5"
          />
          {/* Inner ring detail */}
          <circle
            cx="12"
            cy="12"
            r="7"
            fill="none"
            stroke="#B8860B"
            strokeWidth="0.5"
          />
          {/* Glass reflection */}
          <ellipse
            cx="9"
            cy="9"
            rx="3"
            ry="2"
            fill="rgba(255,255,255,0.4)"
          />
          {/* Chain hanging down */}
          <path
            d="M21 12 Q24 16 22 22"
            stroke="#D4AF37"
            strokeWidth="1.5"
            fill="none"
          />
          <circle cx="22" cy="22" r="1" fill="#D4AF37" />
        </svg>
      )
    }
    case 'avatar-crystal-ball': {
      // Crystal ball in bottom-right corner, overlapping the avatar
      const ballSize =
        size === '2xs' || size === 'xs' ? 12 : size === 'sm' ? 16 : 20
      return (
        <svg
          className="absolute"
          style={{
            right:
              size === '2xs' || size === 'xs' ? -4 : size === 'sm' ? -5 : -6,
            bottom:
              size === '2xs' || size === 'xs' ? -3 : size === 'sm' ? -4 : -5,
            width: ballSize,
            height: ballSize,
            filter: 'drop-shadow(0 0 4px rgba(139,92,246,0.6))',
          }}
          viewBox="0 0 24 24"
        >
          {/* Base/stand */}
          <ellipse cx="12" cy="22" rx="5" ry="1.5" fill="#4B5563" />
          <path d="M8 20 L10 22 L14 22 L16 20 Z" fill="#6B7280" />
          {/* Ball */}
          <circle cx="12" cy="12" r="10" fill="url(#crystalGradientAcc)" />
          {/* Inner mystical swirl */}
          <circle cx="12" cy="12" r="7" fill="rgba(139,92,246,0.25)" />
          <ellipse
            cx="12"
            cy="12"
            rx="5"
            ry="3"
            fill="rgba(167,139,250,0.3)"
            transform="rotate(-20 12 12)"
          />
          {/* Sparkle highlights */}
          <circle cx="8" cy="8" r="2" fill="rgba(255,255,255,0.5)" />
          <circle cx="6" cy="10" r="1" fill="rgba(255,255,255,0.3)" />
          <defs>
            <radialGradient id="crystalGradientAcc" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#E9D5FF" />
              <stop offset="40%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#6D28D9" />
            </radialGradient>
          </defs>
        </svg>
      )
    }
    case 'avatar-thought-yes': {
      // YES thought bubble above avatar
      return (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top:
              size === '2xs' || size === 'xs' ? -12 : size === 'sm' ? -14 : -18,
          }}
        >
          <div
            className="relative rounded-full bg-green-500 px-1.5 py-0.5 text-white"
            style={{
              fontSize:
                size === '2xs' || size === 'xs'
                  ? '6px'
                  : size === 'sm'
                  ? '7px'
                  : '9px',
              fontWeight: 'bold',
            }}
          >
            YES
            {/* Thought bubble tail */}
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full bg-green-500"
              style={{
                bottom: -3,
                width: 4,
                height: 4,
              }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full bg-green-500"
              style={{
                bottom: -6,
                width: 2,
                height: 2,
              }}
            />
          </div>
        </div>
      )
    }
    case 'avatar-thought-no': {
      // NO thought bubble above avatar
      return (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top:
              size === '2xs' || size === 'xs' ? -12 : size === 'sm' ? -14 : -18,
          }}
        >
          <div
            className="relative rounded-full bg-red-500 px-1.5 py-0.5 text-white"
            style={{
              fontSize:
                size === '2xs' || size === 'xs'
                  ? '6px'
                  : size === 'sm'
                  ? '7px'
                  : '9px',
              fontWeight: 'bold',
            }}
          >
            NO
            {/* Thought bubble tail */}
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full bg-red-500"
              style={{
                bottom: -3,
                width: 4,
                height: 4,
              }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full bg-red-500"
              style={{
                bottom: -6,
                width: 2,
                height: 2,
              }}
            />
          </div>
        </div>
      )
    }
    case 'avatar-stonks-up': {
      // Stonks meme style - line chart going up with arrow
      const chartSize =
        size === '2xs' || size === 'xs' ? 14 : size === 'sm' ? 18 : 24
      return (
        <svg
          className="absolute"
          style={{
            right:
              size === '2xs' || size === 'xs' ? -5 : size === 'sm' ? -6 : -8,
            bottom:
              size === '2xs' || size === 'xs' ? -4 : size === 'sm' ? -5 : -6,
            width: chartSize,
            height: chartSize,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
          viewBox="0 0 24 24"
        >
          {/* Background panel */}
          <rect
            x="1"
            y="1"
            width="22"
            height="22"
            rx="2"
            fill="#1F2937"
            opacity="0.9"
          />
          {/* Grid lines */}
          <line x1="4" y1="18" x2="20" y2="18" stroke="#374151" strokeWidth="0.5" />
          <line x1="4" y1="12" x2="20" y2="12" stroke="#374151" strokeWidth="0.5" />
          <line x1="4" y1="6" x2="20" y2="6" stroke="#374151" strokeWidth="0.5" />
          {/* Stonks line going UP */}
          <polyline
            points="4,16 8,14 12,12 16,7 20,4"
            fill="none"
            stroke="#22C55E"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Arrow head at the end */}
          <polygon points="20,4 17,6 18,8" fill="#22C55E" />
          {/* Glow effect */}
          <polyline
            points="4,16 8,14 12,12 16,7 20,4"
            fill="none"
            stroke="#4ADE80"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      )
    }
    case 'avatar-stonks-down': {
      // Stonks meme style - line chart going down (stinks/not stonks)
      const chartSize =
        size === '2xs' || size === 'xs' ? 14 : size === 'sm' ? 18 : 24
      return (
        <svg
          className="absolute"
          style={{
            right:
              size === '2xs' || size === 'xs' ? -5 : size === 'sm' ? -6 : -8,
            bottom:
              size === '2xs' || size === 'xs' ? -4 : size === 'sm' ? -5 : -6,
            width: chartSize,
            height: chartSize,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
          viewBox="0 0 24 24"
        >
          {/* Background panel */}
          <rect
            x="1"
            y="1"
            width="22"
            height="22"
            rx="2"
            fill="#1F2937"
            opacity="0.9"
          />
          {/* Grid lines */}
          <line x1="4" y1="18" x2="20" y2="18" stroke="#374151" strokeWidth="0.5" />
          <line x1="4" y1="12" x2="20" y2="12" stroke="#374151" strokeWidth="0.5" />
          <line x1="4" y1="6" x2="20" y2="6" stroke="#374151" strokeWidth="0.5" />
          {/* Not stonks line going DOWN */}
          <polyline
            points="4,6 8,8 12,10 16,15 20,19"
            fill="none"
            stroke="#EF4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Arrow head at the end */}
          <polygon points="20,19 17,17 18,15" fill="#EF4444" />
          {/* Glow effect */}
          <polyline
            points="4,6 8,8 12,10 16,15 20,19"
            fill="none"
            stroke="#FCA5A5"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      )
    }
    default:
      return null
  }
}

export function EmptyAvatar(props: {
  className?: string
  size?: number
  multi?: boolean
}) {
  const { className, size = 8, multi } = props
  const insize = size - floor(size / 3)
  const Icon = multi ? UsersIcon : UserIcon

  return (
    <div
      className={clsx(
        `flex flex-shrink-0 h-${size} w-${size} bg-ink-200 items-center justify-center rounded-full`,
        className
      )}
    >
      <Icon className={`h-${insize} w-${insize} text-ink-500`} aria-hidden />
    </div>
  )
}
