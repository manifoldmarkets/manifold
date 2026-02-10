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
  shouldAnimateFireItem,
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
    const animateFireItem = displayContext
      ? shouldAnimateFireItem(displayContext)
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
    const hasFireItem = userHasAvatarDecoration(
      entitlements,
      'avatar-fire-item'
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
      hasFireItem ||
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
        {/* Fire item - blazing ring of fire */}
        {hasFireItem && <FireItemDecoration size={size} animate={animateFireItem} />}
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
              hasBlackHole && 'relative ring-2 ring-purple-900',
              hasFireItem && 'relative'
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
              hasBlackHole && 'relative ring-2 ring-purple-900',
              hasFireItem && 'relative'
            )}
            onClick={onClick}
          />
        )}
        {/* Fire item foreground flames - rendered ON TOP of avatar */}
        {hasFireItem && <FireItemForeground size={size} animate={animateFireItem} />}
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

// Black hole decoration - dramatic swirling void with bright accretion disk
function BlackHoleDecoration(props: { size?: AvatarSizeType }) {
  const { size } = props
  // Larger size to show the accretion disk properly
  const bhSize =
    size === '2xs' || size === 'xs' ? 32 : size === 'sm' ? 48 : 64
  const offset =
    size === '2xs' || size === 'xs' ? -8 : size === 'sm' ? -12 : -16

  return (
    <svg
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{
        width: bhSize,
        height: bhSize,
        marginLeft: offset / 2,
        marginTop: offset / 2,
        filter: 'drop-shadow(0 0 8px rgba(147, 51, 234, 0.5))',
      }}
      viewBox="0 0 64 64"
    >
      <defs>
        {/* Bright accretion disk gradient - hot colors */}
        <linearGradient id="bh-accretion-hot" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="30%" stopColor="#ec4899" />
          <stop offset="60%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        {/* Dark void center */}
        <radialGradient id="bh-void" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" />
          <stop offset="70%" stopColor="#0a0010" />
          <stop offset="100%" stopColor="#1a0030" stopOpacity="0" />
        </radialGradient>
        {/* Outer glow */}
        <radialGradient id="bh-outer-glow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="transparent" />
          <stop offset="80%" stopColor="#7c3aed" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.2" />
        </radialGradient>
      </defs>

      {/* Outer purple glow */}
      <circle cx="32" cy="32" r="30" fill="url(#bh-outer-glow)" />

      {/* Bright accretion disk - tilted ellipse effect with multiple rings */}
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="url(#bh-accretion-hot)" strokeWidth="4" opacity="0.8" transform="rotate(-20 32 32)" />
      <ellipse cx="32" cy="32" rx="24" ry="8" fill="none" stroke="#f472b6" strokeWidth="2" opacity="0.6" transform="rotate(-20 32 32)" />
      <ellipse cx="32" cy="32" rx="20" ry="6" fill="none" stroke="#c084fc" strokeWidth="1.5" opacity="0.5" transform="rotate(-20 32 32)" />

      {/* Swirling matter streams */}
      <path d="M8 32 Q16 20 32 18 Q48 16 56 28" stroke="#f97316" strokeWidth="3" fill="none" opacity="0.7" strokeLinecap="round" />
      <path d="M56 32 Q48 44 32 46 Q16 48 8 36" stroke="#a855f7" strokeWidth="3" fill="none" opacity="0.7" strokeLinecap="round" />

      {/* Spiral arms */}
      <path d="M32 4 Q44 8 52 20 Q56 32 48 44" stroke="#ec4899" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />
      <path d="M32 60 Q20 56 12 44 Q8 32 16 20" stroke="#8b5cf6" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />

      {/* Bright hot spots in the disk */}
      <circle cx="12" cy="28" r="2" fill="#fbbf24" opacity="0.9" />
      <circle cx="52" cy="36" r="2" fill="#fb923c" opacity="0.9" />
      <circle cx="20" cy="40" r="1.5" fill="#f472b6" opacity="0.8" />
      <circle cx="44" cy="24" r="1.5" fill="#c084fc" opacity="0.8" />

      {/* Infalling particles/stars */}
      <circle cx="6" cy="20" r="1" fill="#fff" opacity="0.9" />
      <circle cx="58" cy="44" r="1" fill="#fff" opacity="0.9" />
      <circle cx="24" cy="6" r="0.8" fill="#e9d5ff" opacity="0.8" />
      <circle cx="40" cy="58" r="0.8" fill="#fce7f3" opacity="0.8" />
      <circle cx="10" cy="48" r="0.6" fill="#ddd6fe" opacity="0.7" />
      <circle cx="54" cy="16" r="0.6" fill="#fbcfe8" opacity="0.7" />
    </svg>
  )
}

// Fire item background glow — fiery halo BEHIND avatar, concentrated at bottom-right where flames are
function FireItemDecoration(props: { size?: AvatarSizeType; animate?: boolean }) {
  const { animate } = props
  return (
    <div
      className={clsx(
        'absolute -inset-1.5 rounded-full blur-[5px]',
        animate && 'animate-pulse'
      )}
      style={{
        background:
          'radial-gradient(ellipse at 70% 75%, rgba(249,115,22,0.7) 0%, rgba(234,88,12,0.5) 25%, rgba(220,38,38,0.3) 45%, rgba(180,83,9,0.15) 65%, transparent 85%)',
      }}
    />
  )
}

// Foreground: flames (unclipped) + wispy smoke + flame smoke wisps + embers (clipped) ON TOP of avatar
function FireItemForeground(props: { size?: AvatarSizeType; animate?: boolean }) {
  const { size, animate } = props
  // flameSize must maintain a constant ratio to avatar pixel size (1.375)
  // so flames sit on the avatar border at all sizes
  const s =
    size === '2xs' ? 4 : size === 'xs' ? 6 : size === 'sm' ? 8
    : size === 'md' ? 10 : size === 'lg' ? 12 : size === 'xl' ? 24 : 10
  const flameSize = Math.round(s * 4 * 1.375)
  const playState = animate ? 'running' : 'paused'
  return (
    <>
      <style>{`
        @keyframes ember-rise-1 {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(4px, -15px) scale(0); opacity: 0; }
        }
        @keyframes ember-rise-2 {
          0% { transform: translate(0, 0) scale(1); opacity: 0.8; }
          100% { transform: translate(-2px, -12px) scale(0); opacity: 0; }
        }
        @keyframes ember-rise-3 {
          0% { transform: translate(0, 0) scale(1); opacity: 0.9; }
          100% { transform: translate(1px, -18px) scale(0); opacity: 0; }
        }
        @keyframes wisp-drift-1 {
          0%, 100% { transform: translateX(0) translateY(0); }
          50% { transform: translateX(6px) translateY(-1.5px); }
        }
        @keyframes wisp-drift-2 {
          0%, 100% { transform: translateX(0) translateY(0); }
          50% { transform: translateX(5px) translateY(1px); }
        }
        @keyframes wisp-drift-3 {
          0%, 100% { transform: translateX(0) translateY(0); }
          50% { transform: translateX(4px) translateY(-1px); }
        }
        @keyframes flame-smoke-drift-1 {
          0% { transform: translate(0, 0); opacity: 0.7; }
          50% { transform: translate(-6px, -8px); opacity: 0.4; }
          100% { transform: translate(-12px, -14px); opacity: 0; }
        }
        @keyframes flame-smoke-drift-2 {
          0% { transform: translate(0, 0); opacity: 0.6; }
          50% { transform: translate(-4px, -7px); opacity: 0.3; }
          100% { transform: translate(-8px, -12px); opacity: 0; }
        }
      `}</style>

      {/* Flame cluster — ON TOP of avatar, unclipped so flames at edge are visible */}
      <svg
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 overflow-visible"
        style={{ width: flameSize, height: flameSize }}
        viewBox="0 0 80 80"
        fill="none"
      >
        {/* Top flame cluster — ~4.5 o'clock on border */}
        <g>
          <path
            d="M60,59 C62,59 64,58 66,55 C68,51 66,47 65,44 C64,47 62,51 60,53 C58,55 59,57 60,59Z"
            fill="#f97316"
            className={clsx('opacity-90 transition-transform duration-300 origin-[60px_59px]', animate && 'scale-110')}
          />
          <path
            d="M56,59 C58,59 60,58 61,56 C61,53 60,51 59,49 C58,51 57,53 55,55 C55,57 55,58 56,59Z"
            fill="#dc2626"
            className={clsx('opacity-80 transition-transform duration-500 origin-[56px_59px]', animate && 'scale-110')}
          />
          <path
            d="M64,53 C65,53 66,52 67,50 C68,48 67,46 66.5,45 C66,46 65,48 64,49 C63,50 63.5,52 64,53Z"
            fill="#fbbf24"
            className={clsx('opacity-70 transition-transform duration-700 origin-[64px_53px]', animate && 'scale-125')}
          />
        </g>
        {/* Mini flame cluster — ~5 o'clock on border */}
        <g>
          <path
            d="M54,65 C56,65 57,64 58,62 C59,60 58,58 57,56 C57,58 56,60 55,61 C54,63 54,64 54,65Z"
            fill="#f97316"
            className={clsx('opacity-85 transition-transform duration-300 origin-[54px_65px]', animate && 'scale-110')}
          />
          <path
            d="M51,66 C52,66 53,65 54,64 C54,62 53,61 53,60 C52,61 52,62 51,63 C50,64 51,65 51,66Z"
            fill="#dc2626"
            className={clsx('opacity-75 transition-transform duration-500 origin-[51px_66px]', animate && 'scale-110')}
          />
          <path
            d="M57,61 C58,61 58,60 59,59 C59,58 58,57 58,56 C58,57 57,58 57,59 C57,60 57,60 57,61Z"
            fill="#fbbf24"
            className={clsx('opacity-65 transition-transform duration-700 origin-[57px_61px]', animate && 'scale-125')}
          />
        </g>
        {/* Primary flame cluster — ~5.5 o'clock, spilling right below photo frame */}
        <g>
          {/* Counterbalancing teardrop flames — behind main flames */}
          <path
            d="M56,70 C54,70 52,69 51,67 C51,64 52,62 53,60 C54,63 55,65 56,67 C57,68 57,69 56,70Z"
            fill="#f59e0b"
            className={clsx('opacity-75 transition-transform duration-400 origin-[56px_70px]', animate && 'scale-110')}
          />
          <path
            d="M52,72 C50,72 48,71 48,69 C47,66 48,64 49,62 C50,65 51,67 52,69 C52,70 52,71 52,72Z"
            fill="#ea580c"
            className={clsx('opacity-75 transition-transform duration-400 origin-[52px_72px]', animate && 'scale-110')}
          />
          {/* Main flames — rendered on top */}
          <path
            d="M52,72 C54,72 56,71 58,68 C60,64 58,60 57,57 C56,60 54,64 52,66 C50,68 51,70 52,72Z"
            fill="#f97316"
            className={clsx('opacity-90 transition-transform duration-300 origin-[52px_72px]', animate && 'scale-110')}
          />
          <path
            d="M56,66 C57,66 58,65 59,63 C60,61 59,59 58.5,58 C58,59 57,61 56,62 C55,63 55.5,65 56,66Z"
            fill="#fbbf24"
            className={clsx('opacity-70 transition-transform duration-700 origin-[56px_66px]', animate && 'scale-125')}
          />
        </g>
      </svg>

      {/* Smoke wisps drifting over flames — only when animated, positioned near flame cluster */}
      {animate && (
        <>
          <div
            className="pointer-events-none absolute z-20"
            style={{
              right: '-2%', bottom: '20%',
              width: '16px', height: '3px',
              background: 'linear-gradient(135deg, rgba(200,200,210,0.7) 0%, rgba(160,165,175,0.4) 60%, transparent 100%)',
              borderRadius: '2px',
              filter: 'blur(1.5px)',
              animation: 'flame-smoke-drift-1 2.5s ease-out infinite',
            }}
          />
          <div
            className="pointer-events-none absolute z-20"
            style={{
              right: '2%', bottom: '26%',
              width: '12px', height: '2.5px',
              background: 'linear-gradient(135deg, rgba(180,185,195,0.6) 0%, rgba(160,165,175,0.3) 60%, transparent 100%)',
              borderRadius: '2px',
              filter: 'blur(1px)',
              animation: 'flame-smoke-drift-2 3s ease-out infinite',
              animationDelay: '0.6s',
            }}
          />
        </>
      )}

      {/* Clipped overlay — wisps, flame smoke, embers (clipped to avatar circle) */}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-full">
        {/* Fiery light cast — same radial gradient as background glow, overlaying the avatar */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 70% 75%, rgba(249,115,22,0.35) 0%, rgba(234,88,12,0.2) 25%, rgba(220,38,38,0.1) 45%, transparent 70%)',
          }}
        />
        {/* Wispy smoke streaks — left-to-right, over the avatar */}
        <div
          className="absolute"
          style={{
            left: '10%', top: '55%',
            width: '80%', height: '4px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(200,205,215,0.45) 20%, rgba(180,185,195,0.3) 60%, transparent 100%)',
            borderRadius: '2px',
            filter: 'blur(1.5px)',
            ...(animate ? { animation: 'wisp-drift-1 4s ease-in-out infinite' } : {}),
          }}
        />
        <div
          className="absolute"
          style={{
            left: '5%', top: '40%',
            width: '65%', height: '3.5px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(200,205,215,0.4) 30%, rgba(180,185,195,0.25) 70%, transparent 100%)',
            borderRadius: '2px',
            filter: 'blur(2px)',
            ...(animate ? { animation: 'wisp-drift-2 5s ease-in-out infinite', animationDelay: '0.8s' } : {}),
          }}
        />
        <div
          className="absolute"
          style={{
            left: '20%', top: '68%',
            width: '70%', height: '3.5px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(200,205,215,0.42) 25%, rgba(180,185,195,0.28) 55%, transparent 100%)',
            borderRadius: '2px',
            filter: 'blur(1.5px)',
            ...(animate ? { animation: 'wisp-drift-3 4.5s ease-in-out infinite', animationDelay: '1.5s' } : {}),
          }}
        />

        {/* Ember particles — above the flames, drift upward when animated */}
        <div
          className="absolute h-[2px] w-[2px] rounded-full bg-amber-400"
          style={{
            left: '70%', top: '60%',
            boxShadow: '0 0 3px #fbbf24',
            animation: 'ember-rise-1 1.5s infinite ease-out',
            animationPlayState: playState,
          }}
        />
        <div
          className="absolute h-[1.5px] w-[1.5px] rounded-full bg-orange-500"
          style={{
            left: '66%', top: '66%',
            animation: 'ember-rise-2 2s infinite ease-out',
            animationDelay: '0.2s',
            animationPlayState: playState,
          }}
        />
        <div
          className="absolute h-[1.5px] w-[1.5px] rounded-full bg-red-500 opacity-80"
          style={{
            left: '76%', top: '54%',
            animation: 'ember-rise-3 1.8s infinite ease-out',
            animationDelay: '0.5s',
            animationPlayState: playState,
          }}
        />
      </div>
    </>
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
      // Monocle in top-right area, overlapping the eye region
      const monocleSize =
        size === '2xs' || size === 'xs' ? 10 : size === 'sm' ? 14 : 18
      return (
        <svg
          className="absolute"
          style={{
            right: size === '2xs' || size === 'xs' ? 0 : size === 'sm' ? 0 : -1,
            top: size === '2xs' || size === 'xs' ? 0 : size === 'sm' ? 1 : 2,
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
            r="10"
            fill="rgba(200,220,255,0.15)"
            stroke="#D4AF37"
            strokeWidth="2.5"
          />
          {/* Inner ring detail */}
          <circle
            cx="12"
            cy="12"
            r="7.5"
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
            fill="rgba(255,255,255,0.5)"
          />
        </svg>
      )
    }
    case 'avatar-crystal-ball': {
      // Crystal ball with golden base in bottom-right corner
      const ballSize =
        size === '2xs' || size === 'xs' ? 10 : size === 'sm' ? 14 : 18
      return (
        <svg
          className="absolute"
          style={{
            right: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            bottom: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            width: ballSize,
            height: ballSize,
            filter: 'drop-shadow(0 0 3px rgba(139,92,246,0.6))',
          }}
          viewBox="0 0 24 24"
        >
          <defs>
            <radialGradient id="crystalGradientAcc" cx="30%" cy="30%">
              <stop offset="0%" stopColor="#E9D5FF" />
              <stop offset="40%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#6D28D9" />
            </radialGradient>
          </defs>
          {/* Base - flat ellipse at bottom */}
          <ellipse cx="12" cy="22.5" rx="6" ry="1.5" fill="#8B6914" />
          {/* Stem */}
          <rect x="9.5" y="19" width="5" height="3.5" rx="0.5" fill="#B8860B" />
          {/* Cradle - golden arc cupping the ball */}
          <path d="M5 16 Q5 20.5 12 20.5 Q19 20.5 19 16" fill="#D4AF37" />
          {/* Ball */}
          <circle cx="12" cy="9.5" r="8.5" fill="url(#crystalGradientAcc)" />
          {/* Inner mystical swirl */}
          <circle cx="12" cy="9.5" r="5.5" fill="rgba(139,92,246,0.3)" />
          {/* Sparkle highlights */}
          <circle cx="9" cy="6.5" r="2" fill="rgba(255,255,255,0.6)" />
          <circle cx="7" cy="9" r="0.8" fill="rgba(255,255,255,0.4)" />
        </svg>
      )
    }
    case 'avatar-thought-yes': {
      // YES thought bubble in top-right corner
      return (
        <div
          className="absolute"
          style={{
            top: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            right: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        >
          <div
            className="relative rounded-full bg-green-500 px-1 py-0.5 text-white"
            style={{
              fontSize:
                size === '2xs' || size === 'xs'
                  ? '5px'
                  : size === 'sm'
                  ? '6px'
                  : '8px',
              fontWeight: 'bold',
            }}
          >
            YES
          </div>
        </div>
      )
    }
    case 'avatar-thought-no': {
      // NO thought bubble in top-right corner
      return (
        <div
          className="absolute"
          style={{
            top: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            right: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        >
          <div
            className="rounded-full bg-red-500 px-1 py-0.5 text-white"
            style={{
              fontSize:
                size === '2xs' || size === 'xs'
                  ? '5px'
                  : size === 'sm'
                  ? '6px'
                  : '8px',
              fontWeight: 'bold',
            }}
          >
            NO
          </div>
        </div>
      )
    }
    case 'avatar-stonks-up': {
      // Arrow up in bottom-right corner
      const arrowSize =
        size === '2xs' || size === 'xs' ? 10 : size === 'sm' ? 14 : 18
      return (
        <svg
          className="absolute"
          style={{
            right: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            bottom: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            width: arrowSize,
            height: arrowSize,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
          viewBox="0 0 24 24"
        >
          <defs>
            <linearGradient id="stonks-up-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#15803d" />
              <stop offset="50%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
          </defs>
          {/* Background circle */}
          <circle cx="12" cy="12" r="11" fill="#1f2937" />
          {/* Up arrow */}
          <path
            d="M12 4 L18 12 L14 12 L14 20 L10 20 L10 12 L6 12 Z"
            fill="url(#stonks-up-grad)"
          />
        </svg>
      )
    }
    case 'avatar-stonks-down': {
      // Arrow down in bottom-right corner
      const arrowSize =
        size === '2xs' || size === 'xs' ? 10 : size === 'sm' ? 14 : 18
      return (
        <svg
          className="absolute"
          style={{
            right: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            bottom: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            width: arrowSize,
            height: arrowSize,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
          viewBox="0 0 24 24"
        >
          <defs>
            <linearGradient id="stonks-down-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fca5a5" />
              <stop offset="50%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#b91c1c" />
            </linearGradient>
          </defs>
          {/* Background circle */}
          <circle cx="12" cy="12" r="11" fill="#1f2937" />
          {/* Down arrow */}
          <path
            d="M12 20 L18 12 L14 12 L14 4 L10 4 L10 12 L6 12 Z"
            fill="url(#stonks-down-grad)"
          />
        </svg>
      )
    }
    case 'avatar-stonks-meme': {
      // The iconic diagonal STONKS meme arrow - goes IN FRONT of the avatar
      const memeSize =
        size === '2xs' || size === 'xs' ? 20 : size === 'sm' ? 32 : 44
      return (
        <svg
          className="absolute pointer-events-none"
          style={{
            left: '60%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: memeSize,
            height: memeSize,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            zIndex: 10,
          }}
          viewBox="0 0 64 64"
        >
          <defs>
            <linearGradient id="stonks-top-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
            <linearGradient id="stonks-side-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
          </defs>
          {/* 3D Depth/Side */}
          <path d="M27 50L47 21L43 17L62 6L57 28L53 24L33 54Z" fill="url(#stonks-side-grad)" />
          {/* Main Face */}
          <path d="M25 48L45 19L41 15L60 4L55 26L51 22L31 52Z" fill="url(#stonks-top-grad)" />
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
