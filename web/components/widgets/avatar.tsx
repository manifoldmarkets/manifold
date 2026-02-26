import Router from 'next/router'
import clsx from 'clsx'
import { memo, MouseEvent, useEffect, useId, useState } from 'react'
import { UserCircleIcon, UserIcon, UsersIcon } from '@heroicons/react/solid'
import Image from 'next/image'
import { floor } from 'lodash'
import { isFresh } from './user-link'
import { LuSprout, LuCrown, LuGraduationCap } from 'react-icons/lu'
import { GiTopHat, GiDunceCap } from 'react-icons/gi'
import { UserEntitlement } from 'common/shop/types'
import {
  AngelWingSvg,
  BlackHoleSvg,
  FireFlamesSvg,
  MonocleSvg,
  CrystalBallSvg,
  DisguiseSvg,
  ArrowBadgeSvg,
  StonksMemeArrowSvg,
  BullHornSvg,
  BearEarSvg,
  CatEarSvg,
  SantaHatSvg,
  BunnyEarSvg,
  WizardHatSvg,
  TinfoilHatSvg,
  JesterHatSvg,
  FedoraSvg,
  DevilHornSvg,
} from '../shop/item-svgs'
import {
  userHasAvatarDecoration,
  getActiveAvatarOverlay,
  getActiveAvatarAccessory,
  getOverlayStyle,
  userHasHalo,
  userHasCrown,
  getCrownPosition,
  AvatarDecorationId,
  CrownPosition,
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
    // Get active avatar overlay (hat) - excludes halo and crown since they're unique slots
    const activeOverlay = getActiveAvatarOverlay(entitlements)
    const overlayStyle = getOverlayStyle(entitlements, activeOverlay)
    // Check for halo separately (unique slot - combines with other hats)
    const hasHalo = userHasHalo(entitlements)
    // Check for crown separately (unique slot - combines with other hats)
    const hasCrown = userHasCrown(entitlements)
    const crownPosition = hasCrown ? getCrownPosition(entitlements) : 0
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
      hasCrown ||
      hasHalo ||
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
          needsRelativeWrapper && 'relative isolate',
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
            style={{ zIndex: -3 }}
          />
        )}
        {/* Bad aura - crimson red glow (dark version of golden glow) */}
        {hasBadAura && (
          <div
            className={clsx(
              'absolute -inset-1 rounded-full bg-gradient-to-r from-red-600 via-red-500 to-red-600 opacity-75 blur-sm',
              animateGoldenGlow && 'animate-pulse'
            )}
            style={{ zIndex: -3 }}
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
              zIndex: -3,
              background:
                'radial-gradient(circle, rgba(139,92,246,0.6) 0%, rgba(59,130,246,0.4) 50%, rgba(139,92,246,0.2) 100%)',
            }}
          />
        )}
        {/* Black hole - dark swirling void */}
        {hasBlackHole && <BlackHoleDecoration size={size} />}
        {/* Fire item - blazing ring of fire */}
        {hasFireItem && <FireItemDecoration size={size} animate={animateFireItem} />}
        {/* Angel wings - feathered wings flanking avatar (behind profile pic) */}
        {hasAngelWings && (
          <AngelWingsDecoration
            size={size}
            animateOnHover={animateHatOnHover}
            animate={animateHat}
          />
        )}

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
              hasBlackHole && 'relative ring-1 ring-purple-500/40 shadow-[0_0_6px_rgba(147,51,234,0.5)]',
              hasFireItem && 'relative'
            )}
            style={{ maxWidth: `${s * 0.25}rem`, position: 'relative', zIndex: 0 }}
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
              hasBlackHole && 'relative ring-1 ring-purple-500/40 shadow-[0_0_6px_rgba(147,51,234,0.5)]',
              hasFireItem && 'relative'
            )}
            style={{ position: 'relative', zIndex: 0 }}
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
        {/* Halo back half — behind the avatar and hat/crown */}
        {hasHalo && (activeOverlay || hasCrown) && (
          <div style={{ zIndex: -1 }}>
            <AvatarOverlay
              overlay="avatar-halo"
              hatSizeClass={hatSizeClass}
              hatPositionClass={hatPositionClass}
              animateHatOnHover={animateHatOnHover}
              animateHat={animateHat}
              animatePropeller={false}
              size={size}
              haloHalf="back"
            />
          </div>
        )}
        {/* Halo full — when no hat/crown is equipped, render complete halo */}
        {hasHalo && !activeOverlay && !hasCrown && (
          <AvatarOverlay
            overlay="avatar-halo"
            hatSizeClass={hatSizeClass}
            hatPositionClass={hatPositionClass}
            animateHatOnHover={animateHatOnHover}
            animateHat={animateHat}
            animatePropeller={false}
            size={size}
          />
        )}
        {/* Avatar overlay (hat) - sandwiched between halo halves */}
        {activeOverlay && (
          <AvatarOverlay
            overlay={activeOverlay}
            hatSizeClass={hatSizeClass}
            hatPositionClass={hatPositionClass}
            animateHatOnHover={animateHatOnHover}
            animateHat={animateHat}
            animatePropeller={animatePropeller}
            size={size}
            capStyle={overlayStyle}
          />
        )}
        {/* Crown — unique slot, sandwiched between halo halves */}
        {hasCrown && (
          <AvatarOverlay
            overlay="avatar-crown"
            hatSizeClass={hatSizeClass}
            hatPositionClass={hatPositionClass}
            animateHatOnHover={animateHatOnHover}
            animateHat={animateHat}
            animatePropeller={false}
            size={size}
            crownPosition={crownPosition}
          />
        )}
        {/* Halo front half — in front of the hat/crown */}
        {hasHalo && (activeOverlay || hasCrown) && (
          <AvatarOverlay
            overlay="avatar-halo"
            hatSizeClass={hatSizeClass}
            hatPositionClass={hatPositionClass}
            animateHatOnHover={animateHatOnHover}
            animateHat={animateHat}
            animatePropeller={false}
            size={size}
            haloHalf="front"
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
function AngelWingsDecoration(props: {
  size?: AvatarSizeType
  animateOnHover?: boolean
  animate?: boolean
}) {
  const { size, animateOnHover, animate } = props
  const wingW = size === '2xs' || size === 'xs' ? 6 : size === 'sm' ? 9 : 12
  const wingH = size === '2xs' || size === 'xs' ? 16 : size === 'sm' ? 26 : 36
  const offset = size === '2xs' || size === 'xs' ? -3 : size === 'sm' ? -5 : -7

  return (
    <>
      {/* Left wing — wrapper handles rotation animation */}
      <div
        className={clsx(
          'absolute top-1/2 -translate-y-1/2 transition-transform duration-300',
          animateOnHover && 'group-hover:rotate-6',
          animate && 'rotate-6'
        )}
        style={{ left: offset, width: wingW, height: wingH, zIndex: -2 }}
      >
        <AngelWingSvg style={{ width: wingW, height: wingH, opacity: 0.9 }} />
      </div>
      {/* Right wing (mirrored) */}
      <div
        className={clsx(
          'absolute top-1/2 -translate-y-1/2 transition-transform duration-300',
          animateOnHover && 'group-hover:-rotate-6',
          animate && '-rotate-6'
        )}
        style={{ right: offset, width: wingW, height: wingH, zIndex: -2 }}
      >
        <AngelWingSvg
          style={{
            width: wingW,
            height: wingH,
            opacity: 0.9,
            transform: 'scaleX(-1)',
          }}
        />
      </div>
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
    <BlackHoleSvg
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{
        width: bhSize,
        height: bhSize,
        marginLeft: offset / 2,
        marginTop: offset / 2,
        filter: 'drop-shadow(0 0 8px rgba(147, 51, 234, 0.5))',
        zIndex: -3,
      }}
    />
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
        zIndex: -3,
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
      <FireFlamesSvg
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 overflow-visible"
        style={{ width: flameSize, height: flameSize }}
        animate={animate}
      />

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

// Blue cap SVG — 10 style variants (Dark Stitch design in blue)
// 0: Classic (front-facing, flat)
// Left-facing (brim extends left): 1: MANA Left  2: Clean Left  3: Mini Left
// Right-facing (mirrored):         4: MANA Right 5: Clean Right 6: Mini Right
// Shaded variants: 7: Shaded A  8: Shaded B  9: Shaded C
export function BlueCapSvg({ style = 0 }: { style?: number }) {
  // Style mapping:
  // Front-facing: 0: Classic (no text), 1: Mini (no text), 2: MANA (with text)
  // Left-facing:  3: MANA Left, 4: Left (no text), 5: Left Mini (no text)
  // Right-facing: 6: MANA Right, 7: Right (no text), 8: Right Mini (no text)
  const c = { crown: '#2563EB', brim: '#1D4ED8', brimStroke: '#1E40AF', dark: '#1E3A8A' }
  const isFrontFacing = style <= 2
  const showText = style === 2 || style === 3 || style === 6 // MANA text versions
  const isMirrored = style >= 6 // Styles 6, 7, 8 are mirrored (right-facing)
  // Unique ID prefix to avoid gradient collisions when multiple instances render
  const uid = useId().replace(/:/g, '')

  // Front-facing design - brim extends forward toward viewer
  if (isFrontFacing) {
    const brimGradientId = `bc-brim-${uid}`
    return (
      <svg viewBox="0 0 50 40" overflow="visible">
        <defs>
          <linearGradient id={brimGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1E3A8A" />
            <stop offset="50%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1E3A8A" />
          </linearGradient>
        </defs>
        {/* Brim underside shadow — rendered behind brim, peeks out below */}
        <path d="M10,37 Q25,33 40,37" fill="none" stroke="#000000" strokeWidth="2" opacity="0.8" />
        {/* Brim — curved brim effect: corners dip lower than center, straighter sides */}
        <path d="M3,22 C1,27 3,38 7,38 Q25,32 43,38 C47,38 49,27 47,22 C40,26 10,26 3,22 Z" fill={`url(#${brimGradientId})`} stroke={c.dark} strokeWidth="1" />
        {/* Dashed stitching on brim */}
        <path d="M6,25 C5,29 6,35 10,35 Q25,30 40,35 C44,35 45,29 44,25" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        {/* Crown — head-on view */}
        <path d="M3,14 C3,6 11,0 25,0 C39,0 47,6 47,14 L47,22 C42,25 8,25 3,22Z" fill={c.crown} stroke={c.dark} strokeWidth="1" />
        {/* Panel seams */}
        <path d="M25,1 L25,25" stroke={c.dark} strokeWidth="0.5" opacity="0.35" />
        <path d="M25,1 C14,3 8,8 6,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        <path d="M25,1 C36,3 42,8 44,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        {/* MANA text - only on style 2 */}
        {showText && <text x="25" y="17" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="7" fill="#ffffff" textAnchor="middle">MANA</text>}
        {/* Button on top */}
        <circle cx="25" cy="1" r="2.2" fill={c.dark} />
      </svg>
    )
  }

  // Side-angled design (styles 3-8)
  return (
    <svg viewBox="0 0 50 40" overflow="visible">
      <g transform={isMirrored ? 'translate(50,0) scale(-1,1)' : undefined}>
        {/* Brim — Taper C: smooth left extension, tapered right */}
        <path d="M3,20 C3,20 -5,26 -8,31 C-11,37 6,37 25,39 C39,39 47,34 47,20 Q25,23 3,20Z" fill={c.brim} stroke={c.dark} strokeWidth="1" />
        {/* Dashed stitching on brim */}
        <path d="M3,22 C3,22 -4,26 -6,30 C-9,35 6,35 25,37 C38,37 45,32 45,22" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        <path d="M3,24 C3,24 -3,26 -5,29 C-7,33 6,33 25,35 C36,35 43,30 43,24" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        {/* Crown */}
        <path d="M3,14 C3,6 11,0 25,0 C39,0 47,6 47,14 L47,20 C47,23 42,25 25,25 C8,25 3,23 3,20Z" fill={c.crown} stroke={c.dark} strokeWidth="1" />
        {/* Panel seams */}
        <path d="M25,1 L25,25" stroke={c.dark} strokeWidth="0.5" opacity="0.35" />
        <path d="M25,1 C14,3 8,8 6,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        <path d="M25,1 C36,3 42,8 44,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        {/* Button */}
        <circle cx="25" cy="1" r="2.2" fill={c.dark} />
      </g>
      {/* MANA text — rendered outside the mirror group so it stays readable */}
      {showText && <text x="25" y="17" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="7" fill="#ffffff" textAnchor="middle">MANA</text>}
    </svg>
  )
}

// Red cap SVG — 9 style variants (matches BlueCapSvg structure)
// Front: 0: Classic, 1: Mini, 2: MANA | Left: 3: MANA, 4: Clean, 5: Mini | Right: 6: MANA, 7: Clean, 8: Mini
export function RedCapSvg({ style = 0 }: { style?: number }) {
  const c = { crown: '#DC2626', brim: '#B91C1C', dark: '#7F1D1D' }
  const isFrontFacing = style <= 2
  const showText = style === 2 || style === 3 || style === 6 // MANA text versions
  const isMirrored = style >= 6 // Styles 6, 7, 8 are mirrored (right-facing)
  // Unique ID prefix to avoid gradient collisions when multiple instances render
  const uid = useId().replace(/:/g, '')

  // Front-facing design - brim extends forward toward viewer
  if (isFrontFacing) {
    const brimGradientId = `rc-brim-${uid}`
    return (
      <svg viewBox="0 0 50 40" overflow="visible">
        <defs>
          <linearGradient id={brimGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7F1D1D" />
            <stop offset="50%" stopColor="#DC2626" />
            <stop offset="100%" stopColor="#7F1D1D" />
          </linearGradient>
        </defs>
        {/* Brim underside shadow — rendered behind brim, peeks out below */}
        <path d="M10,37 Q25,33 40,37" fill="none" stroke="#000000" strokeWidth="2" opacity="0.8" />
        {/* Brim — curved brim effect: corners dip lower than center, straighter sides */}
        <path d="M3,22 C1,27 3,38 7,38 Q25,32 43,38 C47,38 49,27 47,22 C40,26 10,26 3,22 Z" fill={`url(#${brimGradientId})`} stroke={c.dark} strokeWidth="1" />
        {/* Dashed stitching on brim */}
        <path d="M6,25 C5,29 6,35 10,35 Q25,30 40,35 C44,35 45,29 44,25" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        {/* Crown — head-on view */}
        <path d="M3,14 C3,6 11,0 25,0 C39,0 47,6 47,14 L47,22 C42,25 8,25 3,22Z" fill={c.crown} stroke={c.dark} strokeWidth="1" />
        {/* Panel seams */}
        <path d="M25,1 L25,25" stroke={c.dark} strokeWidth="0.5" opacity="0.35" />
        <path d="M25,1 C14,3 8,8 6,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        <path d="M25,1 C36,3 42,8 44,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        {/* MANA text - only on style 2 */}
        {showText && <text x="25" y="17" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="7" fill="#ffffff" textAnchor="middle">MANA</text>}
        {/* Button on top */}
        <circle cx="25" cy="1" r="2.2" fill={c.dark} />
      </svg>
    )
  }

  // Side-angled design (styles 3-8)
  return (
    <svg viewBox="0 0 50 40" overflow="visible">
      <g transform={isMirrored ? 'translate(50,0) scale(-1,1)' : undefined}>
        {/* Brim — Taper C: smooth left extension, tapered right */}
        <path d="M3,20 C3,20 -5,26 -8,31 C-11,37 6,37 25,39 C39,39 47,34 47,20 Q25,23 3,20Z" fill={c.brim} stroke={c.dark} strokeWidth="1" />
        {/* Dashed stitching on brim */}
        <path d="M3,22 C3,22 -4,26 -6,30 C-9,35 6,35 25,37 C38,37 45,32 45,22" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        <path d="M3,24 C3,24 -3,26 -5,29 C-7,33 6,33 25,35 C36,35 43,30 43,24" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        {/* Crown */}
        <path d="M3,14 C3,6 11,0 25,0 C39,0 47,6 47,14 L47,20 C47,23 42,25 25,25 C8,25 3,23 3,20Z" fill={c.crown} stroke={c.dark} strokeWidth="1" />
        {/* Panel seams */}
        <path d="M25,1 L25,25" stroke={c.dark} strokeWidth="0.5" opacity="0.35" />
        <path d="M25,1 C14,3 8,8 6,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        <path d="M25,1 C36,3 42,8 44,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        {/* Button */}
        <circle cx="25" cy="1" r="2.2" fill={c.dark} />
      </g>
      {/* MANA text — rendered outside the mirror group so it stays readable */}
      {showText && <text x="25" y="17" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="7" fill="#ffffff" textAnchor="middle">MANA</text>}
    </svg>
  )
}

// Green cap SVG — 9 style variants (matches BlueCapSvg structure)
// Front: 0: Classic, 1: Mini, 2: MANA | Left: 3: MANA, 4: Clean, 5: Mini | Right: 6: MANA, 7: Clean, 8: Mini
export function GreenCapSvg({ style = 0 }: { style?: number }) {
  const c = { crown: '#16A34A', brim: '#15803D', dark: '#166534' }
  const isFrontFacing = style <= 2
  const showText = style === 2 || style === 3 || style === 6 // MANA text versions
  const isMirrored = style >= 6 // Styles 6, 7, 8 are mirrored (right-facing)
  // Unique ID prefix to avoid gradient collisions when multiple instances render
  const uid = useId().replace(/:/g, '')

  // Front-facing design - brim extends forward toward viewer
  if (isFrontFacing) {
    const brimGradientId = `gc-brim-${uid}`
    return (
      <svg viewBox="0 0 50 40" overflow="visible">
        <defs>
          <linearGradient id={brimGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#166534" />
            <stop offset="50%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#166534" />
          </linearGradient>
        </defs>
        {/* Brim underside shadow — rendered behind brim, peeks out below */}
        <path d="M10,37 Q25,33 40,37" fill="none" stroke="#000000" strokeWidth="2" opacity="0.8" />
        {/* Brim — curved brim effect: corners dip lower than center, straighter sides */}
        <path d="M3,22 C1,27 3,38 7,38 Q25,32 43,38 C47,38 49,27 47,22 C40,26 10,26 3,22 Z" fill={`url(#${brimGradientId})`} stroke={c.dark} strokeWidth="1" />
        {/* Dashed stitching on brim */}
        <path d="M6,25 C5,29 6,35 10,35 Q25,30 40,35 C44,35 45,29 44,25" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        {/* Crown — head-on view */}
        <path d="M3,14 C3,6 11,0 25,0 C39,0 47,6 47,14 L47,22 C42,25 8,25 3,22Z" fill={c.crown} stroke={c.dark} strokeWidth="1" />
        {/* Panel seams */}
        <path d="M25,1 L25,25" stroke={c.dark} strokeWidth="0.5" opacity="0.35" />
        <path d="M25,1 C14,3 8,8 6,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        <path d="M25,1 C36,3 42,8 44,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        {/* MANA text - only on style 2 */}
        {showText && <text x="25" y="17" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="7" fill="#ffffff" textAnchor="middle">MANA</text>}
        {/* Button on top */}
        <circle cx="25" cy="1" r="2.2" fill={c.dark} />
      </svg>
    )
  }

  // Side-angled design (styles 3-8)
  return (
    <svg viewBox="0 0 50 40" overflow="visible">
      <g transform={isMirrored ? 'translate(50,0) scale(-1,1)' : undefined}>
        {/* Brim — Taper C: smooth left extension, tapered right */}
        <path d="M3,20 C3,20 -5,26 -8,31 C-11,37 6,37 25,39 C39,39 47,34 47,20 Q25,23 3,20Z" fill={c.brim} stroke={c.dark} strokeWidth="1" />
        {/* Dashed stitching on brim */}
        <path d="M3,22 C3,22 -4,26 -6,30 C-9,35 6,35 25,37 C38,37 45,32 45,22" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        <path d="M3,24 C3,24 -3,26 -5,29 C-7,33 6,33 25,35 C36,35 43,30 43,24" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        {/* Crown */}
        <path d="M3,14 C3,6 11,0 25,0 C39,0 47,6 47,14 L47,20 C47,23 42,25 25,25 C8,25 3,23 3,20Z" fill={c.crown} stroke={c.dark} strokeWidth="1" />
        {/* Panel seams */}
        <path d="M25,1 L25,25" stroke={c.dark} strokeWidth="0.5" opacity="0.35" />
        <path d="M25,1 C14,3 8,8 6,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        <path d="M25,1 C36,3 42,8 44,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        {/* Button */}
        <circle cx="25" cy="1" r="2.2" fill={c.dark} />
      </g>
      {/* MANA text — rendered outside the mirror group so it stays readable */}
      {showText && <text x="25" y="17" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="7" fill="#ffffff" textAnchor="middle">MANA</text>}
    </svg>
  )
}

// Black cap SVG — 9 style variants (matches BlueCapSvg structure)
// Front: 0: Classic, 1: Mini, 2: MANA | Left: 3: MANA, 4: Clean, 5: Mini | Right: 6: MANA, 7: Clean, 8: Mini
export function BlackCapSvg({ style = 0 }: { style?: number }) {
  const c = { crown: '#333333', brim: '#222222', dark: '#111111' }
  const isFrontFacing = style <= 2
  const showText = style === 2 || style === 3 || style === 6 // MANA text versions
  const isMirrored = style >= 6 // Styles 6, 7, 8 are mirrored (right-facing)
  // Unique ID prefix to avoid gradient collisions when multiple instances render
  const uid = useId().replace(/:/g, '')

  // Front-facing design - brim extends forward toward viewer
  if (isFrontFacing) {
    const brimGradientId = `bkc-brim-${uid}`
    return (
      <svg viewBox="0 0 50 40" overflow="visible">
        <defs>
          <linearGradient id={brimGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#111111" />
            <stop offset="50%" stopColor="#444444" />
            <stop offset="100%" stopColor="#111111" />
          </linearGradient>
        </defs>
        {/* Brim underside shadow — rendered behind brim, peeks out below */}
        <path d="M10,37 Q25,33 40,37" fill="none" stroke="#000000" strokeWidth="2" opacity="0.8" />
        {/* Brim — curved brim effect: corners dip lower than center, straighter sides */}
        <path d="M3,22 C1,27 3,38 7,38 Q25,32 43,38 C47,38 49,27 47,22 C40,26 10,26 3,22 Z" fill={`url(#${brimGradientId})`} stroke={c.dark} strokeWidth="1" />
        {/* Dashed stitching on brim */}
        <path d="M6,25 C5,29 6,35 10,35 Q25,30 40,35 C44,35 45,29 44,25" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        {/* Crown — head-on view */}
        <path d="M3,14 C3,6 11,0 25,0 C39,0 47,6 47,14 L47,22 C42,25 8,25 3,22Z" fill={c.crown} stroke={c.dark} strokeWidth="1" />
        {/* Panel seams */}
        <path d="M25,1 L25,25" stroke={c.dark} strokeWidth="0.5" opacity="0.35" />
        <path d="M25,1 C14,3 8,8 6,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        <path d="M25,1 C36,3 42,8 44,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        {/* MANA text - only on style 2 */}
        {showText && <text x="25" y="17" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="7" fill="#ffffff" textAnchor="middle">MANA</text>}
        {/* Button on top */}
        <circle cx="25" cy="1" r="2.2" fill={c.dark} />
      </svg>
    )
  }

  // Side-angled design (styles 3-8)
  return (
    <svg viewBox="0 0 50 40" overflow="visible">
      <g transform={isMirrored ? 'translate(50,0) scale(-1,1)' : undefined}>
        {/* Brim — Taper C: smooth left extension, tapered right */}
        <path d="M3,20 C3,20 -5,26 -8,31 C-11,37 6,37 25,39 C39,39 47,34 47,20 Q25,23 3,20Z" fill={c.brim} stroke={c.dark} strokeWidth="1" />
        {/* Dashed stitching on brim */}
        <path d="M3,22 C3,22 -4,26 -6,30 C-9,35 6,35 25,37 C38,37 45,32 45,22" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        <path d="M3,24 C3,24 -3,26 -5,29 C-7,33 6,33 25,35 C36,35 43,30 43,24" fill="none" stroke={c.dark} strokeWidth="0.6" opacity="0.5" strokeDasharray="1.5,1.5" />
        {/* Crown */}
        <path d="M3,14 C3,6 11,0 25,0 C39,0 47,6 47,14 L47,20 C47,23 42,25 25,25 C8,25 3,23 3,20Z" fill={c.crown} stroke={c.dark} strokeWidth="1" />
        {/* Panel seams */}
        <path d="M25,1 L25,25" stroke={c.dark} strokeWidth="0.5" opacity="0.35" />
        <path d="M25,1 C14,3 8,8 6,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        <path d="M25,1 C36,3 42,8 44,20" stroke={c.dark} strokeWidth="0.5" fill="none" opacity="0.35" />
        {/* Button */}
        <circle cx="25" cy="1" r="2.2" fill={c.dark} />
      </g>
      {/* MANA text — rendered outside the mirror group so it stays readable */}
      {showText && <text x="25" y="17" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="7" fill="#ffffff" textAnchor="middle">MANA</text>}
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
  haloHalf?: 'back' | 'front'
  capStyle?: number
  crownPosition?: CrownPosition
}) {
  const {
    overlay,
    hatSizeClass,
    hatPositionClass,
    animateHatOnHover,
    animateHat,
    animatePropeller,
    size,
    haloHalf,
    capStyle = 0,
    crownPosition = 0,
  } = props

  // Corner position (for graduation cap, microphone - sits at top-right)
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

  // Crown position classes (0: Right, 1: Center, 2: Left)
  const crownRightClasses = clsx(
    'absolute transition-transform duration-300',
    hatPositionClass,
    'rotate-45',
    animateHatOnHover && 'group-hover:-translate-y-0.5 group-hover:scale-110',
    animateHat && '-translate-y-0.5 scale-110'
  )
  const crownCenterClasses = clsx(
    'absolute left-1/2 -translate-x-1/2 transition-transform duration-300',
    size === '2xs' || size === 'xs'
      ? '-top-1'
      : size === 'sm'
      ? '-top-1.5'
      : '-top-2',
    animateHatOnHover && 'group-hover:-translate-y-0.5 group-hover:scale-110',
    animateHat && '-translate-y-0.5 scale-110'
  )
  const crownLeftClasses = clsx(
    'absolute transition-transform duration-300',
    size === '2xs' || size === 'xs'
      ? '-top-0.5 -left-0.5'
      : size === 'sm'
      ? '-top-1 -left-1'
      : '-top-1.5 -left-1.5',
    '-rotate-45',
    animateHatOnHover && 'group-hover:-translate-y-0.5 group-hover:scale-110',
    animateHat && '-translate-y-0.5 scale-110'
  )

  switch (overlay) {
    case 'avatar-crown': {
      // Position order: 0=Right, 1=Left, 2=Center (smooth directional cycling)
      const positionClasses =
        crownPosition === 2
          ? crownCenterClasses
          : crownPosition === 1
          ? crownLeftClasses
          : crownRightClasses
      return (
        <div className={positionClasses}>
          <LuCrown
            className={clsx(hatSizeClass, 'text-amber-500')}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          />
        </div>
      )
    }
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
      // Unified halo dimensions — same whether hat is equipped or not
      const haloW =
        size === '2xs' || size === 'xs'
          ? '1.75rem'
          : size === 'sm'
          ? '2.35rem'
          : '3.3rem'
      const haloH =
        size === '2xs' || size === 'xs'
          ? '0.55rem'
          : size === 'sm'
          ? '0.65rem'
          : '0.85rem'
      const haloPositionClass = clsx(
        'absolute left-1/2 -translate-x-1/2 transition-transform duration-300',
        size === '2xs' || size === 'xs'
          ? '-top-0.5'
          : size === 'sm'
          ? '-top-1'
          : '-top-1.5',
        animateHatOnHover && 'group-hover:-translate-y-0.5',
        animateHat && '-translate-y-0.5'
      )

      // Halo stroke colors: white with amber lining
      const whiteStroke = 'rgba(255, 252, 240, 0.95)'
      const amberStroke = 'rgba(217, 170, 50, 0.7)'
      const amberStrokeDark = 'rgba(200, 160, 60, 0.5)'

      // When split for hat overlap, render only one arc half
      // Otherwise render the full ellipse — same viewBox/sizes either way
      const arcPath = haloHalf
        ? haloHalf === 'back'
          ? 'M 2,6 A 18,5 0 0,0 38,6'  // counter-clockwise = lower arc (behind hat)
          : 'M 2,6 A 18,5 0 0,1 38,6'  // clockwise = upper arc (in front of hat)
        : null

      const lightFilter =
        'drop-shadow(0 0 3px rgba(245, 200, 80, 0.5)) drop-shadow(0 0 1px rgba(217, 170, 50, 0.6))'
      const darkFilter =
        'drop-shadow(0 0 3px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 6px rgba(255, 255, 200, 0.4))'

      return (
        <div className={haloPositionClass}>
          {/* Light mode */}
          <svg
            className="dark:hidden"
            width={haloW}
            height={haloH}
            viewBox="0 0 40 12"
            overflow="visible"
            style={{ transform: 'rotate(-8deg)', filter: lightFilter }}
          >
            {arcPath ? (
              <>
                <path d={arcPath} stroke={amberStroke} strokeWidth="3.5" fill="none" />
                <path d={arcPath} stroke={whiteStroke} strokeWidth="1.5" fill="none" />
              </>
            ) : (
              <>
                <ellipse cx="20" cy="6" rx="18" ry="5" stroke={amberStroke} strokeWidth="3.5" fill="none" />
                <ellipse cx="20" cy="6" rx="18" ry="5" stroke={whiteStroke} strokeWidth="1.5" fill="none" />
              </>
            )}
          </svg>
          {/* Dark mode */}
          <svg
            className="hidden dark:block"
            width={haloW}
            height={haloH}
            viewBox="0 0 40 12"
            overflow="visible"
            style={{ transform: 'rotate(-8deg)', filter: darkFilter }}
          >
            {arcPath ? (
              <>
                <path d={arcPath} stroke={amberStrokeDark} strokeWidth="3.5" fill="none" />
                <path d={arcPath} stroke={whiteStroke} strokeWidth="1.5" fill="none" />
              </>
            ) : (
              <>
                <ellipse cx="20" cy="6" rx="18" ry="5" stroke={amberStrokeDark} strokeWidth="3.5" fill="none" />
                <ellipse cx="20" cy="6" rx="18" ry="5" stroke={whiteStroke} strokeWidth="1.5" fill="none" />
              </>
            )}
          </svg>
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
          <WizardHatSvg
            className={clsx(hatSizeClass)}
            style={{ filter: 'drop-shadow(0 0 3px rgba(139, 92, 246, 0.5))' }}
          />
        </div>
      )
    case 'avatar-tinfoil-hat':
      return (
        <div className={cornerClasses}>
          <TinfoilHatSvg
            className={clsx(hatSizeClass)}
            style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}
          />
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
    case 'avatar-jester-hat': {
      const jesterSizeClass =
        size === '2xs' || size === 'xs'
          ? 'h-3 w-3'
          : size === 'sm'
          ? 'h-[1rem] w-[1rem]'
          : 'h-5 w-5'
      return (
        <div
          className={clsx(
            'absolute rotate-45 transition-transform duration-300',
            size === '2xs' || size === 'xs'
              ? '-right-1.5 -top-1.5'
              : size === 'sm'
              ? '-right-1.5 -top-2'
              : '-right-2 -top-2.5',
            animateHatOnHover && 'group-hover:-translate-y-0.5 group-hover:scale-110',
            animateHat && '-translate-y-0.5 scale-110'
          )}
        >
          <JesterHatSvg
            className={clsx(jesterSizeClass)}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          />
        </div>
      )
    }
    case 'avatar-fedora': {
      return (
        <div className={cornerClasses}>
          <FedoraSvg
            className={clsx(hatSizeClass)}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          />
        </div>
      )
    }
    case 'avatar-devil-horns': {
      const hornSize =
        size === '2xs' || size === 'xs' ? 8 : size === 'sm' ? 10 : 12
      const devilHornClasses = clsx(
        'absolute transition-transform duration-300',
        animateHatOnHover &&
          'group-hover:-translate-y-0.5 group-hover:scale-110',
        animateHat && '-translate-y-0.5 scale-110'
      )
      return (
        <>
          <DevilHornSvg
            side="left"
            className={devilHornClasses}
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
          />
          <DevilHornSvg
            side="right"
            className={devilHornClasses}
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
          />
        </>
      )
    }
    case 'avatar-team-red-hat': {
      // Red cap — 9 style variants
      // Front: 0: Classic, 1: Mini, 2: MANA | Left: 3: MANA, 4: Clean, 5: Mini | Right: 6: MANA, 7: Clean, 8: Mini
      const capSizeFull =
        size === '2xs' || size === 'xs' ? 18 : size === 'sm' ? 24 : 30
      const capSizeSmall =
        size === '2xs' || size === 'xs' ? 14 : size === 'sm' ? 19 : 24
      const isSmall = capStyle === 1 || capStyle === 5 || capStyle === 8
      const isFrontFacing = capStyle <= 2
      const capSize = isSmall ? capSizeSmall : capSizeFull
      return (
        <div
          className={clsx(
            'absolute transition-transform duration-300',
            animateHatOnHover &&
              'group-hover:-translate-y-0.5 group-hover:rotate-[-3deg]',
            animateHat && '-translate-y-0.5 rotate-[-3deg]'
          )}
          style={{
            left: '50%',
            transform: isFrontFacing ? 'translateX(-50%)' : 'translateX(-50%) rotate(-5deg)',
            top:
              size === '2xs' || size === 'xs' ? -3 : size === 'sm' ? -5 : -7,
            width: capSize,
            height: capSize,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
        >
          <RedCapSvg style={capStyle} />
        </div>
      )
    }
    case 'avatar-team-green-hat': {
      // Green cap — 9 style variants
      // Front: 0: Classic, 1: Mini, 2: MANA | Left: 3: MANA, 4: Clean, 5: Mini | Right: 6: MANA, 7: Clean, 8: Mini
      const capSizeFull =
        size === '2xs' || size === 'xs' ? 18 : size === 'sm' ? 24 : 30
      const capSizeSmall =
        size === '2xs' || size === 'xs' ? 14 : size === 'sm' ? 19 : 24
      const isSmall = capStyle === 1 || capStyle === 5 || capStyle === 8
      const isFrontFacing = capStyle <= 2
      const capSize = isSmall ? capSizeSmall : capSizeFull
      return (
        <div
          className={clsx(
            'absolute transition-transform duration-300',
            animateHatOnHover &&
              'group-hover:-translate-y-0.5 group-hover:rotate-[-3deg]',
            animateHat && '-translate-y-0.5 rotate-[-3deg]'
          )}
          style={{
            left: '50%',
            transform: isFrontFacing ? 'translateX(-50%)' : 'translateX(-50%) rotate(-5deg)',
            top:
              size === '2xs' || size === 'xs' ? -3 : size === 'sm' ? -5 : -7,
            width: capSize,
            height: capSize,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
        >
          <GreenCapSvg style={capStyle} />
        </div>
      )
    }
    case 'avatar-black-cap': {
      // Black cap — 9 style variants
      // Front: 0: Classic, 1: Mini, 2: MANA | Left: 3: MANA, 4: Clean, 5: Mini | Right: 6: MANA, 7: Clean, 8: Mini
      const capSizeFull =
        size === '2xs' || size === 'xs' ? 18 : size === 'sm' ? 24 : 30
      const capSizeSmall =
        size === '2xs' || size === 'xs' ? 14 : size === 'sm' ? 19 : 24
      const isSmall = capStyle === 1 || capStyle === 5 || capStyle === 8
      const isFrontFacing = capStyle <= 2
      const capSize = isSmall ? capSizeSmall : capSizeFull
      return (
        <div
          className={clsx(
            'absolute transition-transform duration-300',
            animateHatOnHover &&
              'group-hover:-translate-y-0.5 group-hover:rotate-[-3deg]',
            animateHat && '-translate-y-0.5 rotate-[-3deg]'
          )}
          style={{
            left: '50%',
            transform: isFrontFacing
              ? 'translateX(-50%)'
              : 'translateX(-50%) rotate(-5deg)',
            top:
              size === '2xs' || size === 'xs' ? -3 : size === 'sm' ? -5 : -7,
            width: capSize,
            height: capSize,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
        >
          <BlackCapSvg style={capStyle} />
        </div>
      )
    }
    case 'avatar-blue-cap': {
      // Blue cap — 9 style variants
      // Front: 0: Classic, 1: Mini, 2: MANA | Left: 3: MANA, 4: Clean, 5: Mini | Right: 6: MANA, 7: Clean, 8: Mini
      const capSizeFull =
        size === '2xs' || size === 'xs' ? 18 : size === 'sm' ? 24 : 30
      const capSizeSmall =
        size === '2xs' || size === 'xs' ? 14 : size === 'sm' ? 19 : 24
      const isSmall = capStyle === 1 || capStyle === 5 || capStyle === 8
      const isFrontFacing = capStyle <= 2
      const capSize = isSmall ? capSizeSmall : capSizeFull
      return (
        <div
          className={clsx(
            'absolute transition-transform duration-300',
            animateHatOnHover &&
              'group-hover:-translate-y-0.5 group-hover:rotate-[-3deg]',
            animateHat && '-translate-y-0.5 rotate-[-3deg]'
          )}
          style={{
            left: '50%',
            transform: isFrontFacing ? 'translateX(-50%)' : 'translateX(-50%) rotate(-5deg)',
            top:
              size === '2xs' || size === 'xs' ? -3 : size === 'sm' ? -5 : -7,
            width: capSize,
            height: capSize,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
        >
          <BlueCapSvg style={capStyle} />
        </div>
      )
    }
    case 'avatar-bull-horns': {
      const hornW =
        size === '2xs' || size === 'xs' ? 20 : size === 'sm' ? 26 : 32
      const hornH =
        size === '2xs' || size === 'xs' ? 16 : size === 'sm' ? 20 : 24
      return (
        <>
          <BullHornSvg
            className="absolute"
            style={{
              right: '50%',
              top:
                size === '2xs' || size === 'xs' ? -7 : size === 'sm' ? -9 : -11,
              width: hornW,
              height: hornH,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
            }}
          />
          <BullHornSvg
            className="absolute"
            style={{
              left: '50%',
              top:
                size === '2xs' || size === 'xs' ? -7 : size === 'sm' ? -9 : -11,
              width: hornW,
              height: hornH,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
              transform: 'scaleX(-1)',
            }}
          />
        </>
      )
    }
    case 'avatar-bear-ears': {
      const earSize =
        size === '2xs' || size === 'xs' ? 12 : size === 'sm' ? 16 : 20
      const bearEarClasses = clsx(
        'absolute transition-transform duration-300',
        animateHatOnHover &&
          'group-hover:-translate-y-0.5 group-hover:scale-110',
        animateHat && '-translate-y-0.5 scale-110'
      )
      return (
        <>
          <BearEarSvg
            side="left"
            className={bearEarClasses}
            style={{
              left:
                size === '2xs' || size === 'xs' ? -3 : size === 'sm' ? -4 : -6,
              top:
                size === '2xs' || size === 'xs' ? -5 : size === 'sm' ? -6 : -8,
              width: earSize,
              height: earSize,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
            }}
          />
          <BearEarSvg
            side="right"
            className={bearEarClasses}
            style={{
              right:
                size === '2xs' || size === 'xs' ? -3 : size === 'sm' ? -4 : -6,
              top:
                size === '2xs' || size === 'xs' ? -5 : size === 'sm' ? -6 : -8,
              width: earSize,
              height: earSize,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
            }}
          />
        </>
      )
    }
    case 'avatar-cat-ears': {
      const earW =
        size === '2xs' || size === 'xs' ? 14 : size === 'sm' ? 18 : 22
      const earH =
        size === '2xs' || size === 'xs' ? 10 : size === 'sm' ? 13 : 16
      return (
        <>
          <CatEarSvg
            className={clsx(
              'absolute transition-transform duration-300',
              animateHatOnHover &&
                'group-hover:-translate-y-0.5 group-hover:rotate-[-5deg]',
              animateHat && '-translate-y-0.5 rotate-[-5deg]'
            )}
            style={{
              left:
                size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -2 : -2,
              top:
                size === '2xs' || size === 'xs' ? -5 : size === 'sm' ? -7 : -9,
              width: earW,
              height: earH,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
              transform: 'rotate(-12deg)',
            }}
          />
          <CatEarSvg
            className={clsx(
              'absolute transition-transform duration-300',
              animateHatOnHover &&
                'group-hover:-translate-y-0.5 group-hover:rotate-[5deg]',
              animateHat && '-translate-y-0.5 rotate-[5deg]'
            )}
            style={{
              right:
                size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -2 : -2,
              top:
                size === '2xs' || size === 'xs' ? -5 : size === 'sm' ? -7 : -9,
              width: earW,
              height: earH,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
              transform: 'rotate(12deg) scaleX(-1)',
            }}
          />
        </>
      )
    }
    case 'avatar-santa-hat': {
      return (
        <div
          className={clsx(
            'absolute transition-transform duration-300',
            hatPositionClass,
            'rotate-[20deg]',
            animateHatOnHover &&
              'group-hover:-translate-y-0.5 group-hover:scale-110',
            animateHat && '-translate-y-0.5 scale-110'
          )}
        >
          <SantaHatSvg
            className={hatSizeClass}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
          />
        </div>
      )
    }
    case 'avatar-bunny-ears': {
      const earSize =
        size === '2xs' || size === 'xs' ? 12 : size === 'sm' ? 16 : 22
      return (
        <>
          <BunnyEarSvg
            className={clsx(
              'absolute transition-transform duration-300',
              animateHatOnHover &&
                'group-hover:-translate-y-1 group-hover:rotate-[-5deg]',
              animateHat && '-translate-y-1 rotate-[-5deg]'
            )}
            style={{
              left:
                size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
              top:
                size === '2xs' || size === 'xs' ? -10 : size === 'sm' ? -14 : -18,
              width: earSize,
              height: earSize * 1.5,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
              transform: 'rotate(-15deg)',
            }}
          />
          <BunnyEarSvg
            className={clsx(
              'absolute transition-transform duration-300',
              animateHatOnHover &&
                'group-hover:-translate-y-1 group-hover:rotate-[5deg]',
              animateHat && '-translate-y-1 rotate-[5deg]'
            )}
            style={{
              right:
                size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
              top:
                size === '2xs' || size === 'xs' ? -10 : size === 'sm' ? -14 : -18,
              width: earSize,
              height: earSize * 1.5,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
              transform: 'rotate(15deg)',
            }}
          />
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
      const monocleSize =
        size === '2xs' || size === 'xs' ? 10 : size === 'sm' ? 14 : 18
      return (
        <MonocleSvg
          className="absolute"
          style={{
            left: size === '2xs' || size === 'xs' ? 2 : size === 'sm' ? 4 : 6,
            top: size === '2xs' || size === 'xs' ? 4 : size === 'sm' ? 6 : 8,
            width: monocleSize,
            height: monocleSize,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
        />
      )
    }
    case 'avatar-crystal-ball': {
      const ballSize =
        size === '2xs' || size === 'xs' ? 10 : size === 'sm' ? 14 : 18
      return (
        <CrystalBallSvg
          className="absolute"
          style={{
            right: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            bottom: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            width: ballSize,
            height: ballSize,
            filter: 'drop-shadow(0 0 3px rgba(139,92,246,0.6))',
          }}
        />
      )
    }
    case 'avatar-disguise': {
      const disguiseSize =
        size === '2xs' || size === 'xs' ? 16 : size === 'sm' ? 22 : 28
      return (
        <DisguiseSvg
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: size === '2xs' || size === 'xs' ? 4 : size === 'sm' ? 6 : 8,
            width: disguiseSize,
            height: disguiseSize * 0.7,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        />
      )
    }
    case 'avatar-thought-yes': {
      // YES thought bubble at top-left with trailing bubbles
      const bubbleSize = size === '2xs' || size === 'xs' ? 5 : size === 'sm' ? 6 : 8
      return (
        <div
          className="absolute"
          style={{
            left: size === '2xs' || size === 'xs' ? -4 : size === 'sm' ? -6 : -8,
            top: size === '2xs' || size === 'xs' ? -6 : size === 'sm' ? -8 : -10,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        >
          {/* Main bubble */}
          <div
            className="rounded-full bg-green-500 px-1 py-0.5 text-white"
            style={{
              fontSize: bubbleSize,
              fontWeight: 'bold',
            }}
          >
            YES
          </div>
          {/* Trailing bubbles */}
          <div
            className="absolute rounded-full bg-green-500"
            style={{
              width: bubbleSize * 0.5,
              height: bubbleSize * 0.5,
              right: -2,
              bottom: -bubbleSize * 0.4,
            }}
          />
          <div
            className="absolute rounded-full bg-green-500"
            style={{
              width: bubbleSize * 0.3,
              height: bubbleSize * 0.3,
              right: -4,
              bottom: -bubbleSize * 0.7,
            }}
          />
        </div>
      )
    }
    case 'avatar-thought-no': {
      // NO thought bubble at top-left with trailing bubbles
      const bubbleSize = size === '2xs' || size === 'xs' ? 5 : size === 'sm' ? 6 : 8
      return (
        <div
          className="absolute"
          style={{
            left: size === '2xs' || size === 'xs' ? -4 : size === 'sm' ? -6 : -8,
            top: size === '2xs' || size === 'xs' ? -6 : size === 'sm' ? -8 : -10,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        >
          {/* Main bubble */}
          <div
            className="rounded-full bg-red-500 px-1 py-0.5 text-white"
            style={{
              fontSize: bubbleSize,
              fontWeight: 'bold',
            }}
          >
            NO
          </div>
          {/* Trailing bubbles */}
          <div
            className="absolute rounded-full bg-red-500"
            style={{
              width: bubbleSize * 0.5,
              height: bubbleSize * 0.5,
              right: -2,
              bottom: -bubbleSize * 0.4,
            }}
          />
          <div
            className="absolute rounded-full bg-red-500"
            style={{
              width: bubbleSize * 0.3,
              height: bubbleSize * 0.3,
              right: -4,
              bottom: -bubbleSize * 0.7,
            }}
          />
        </div>
      )
    }
    case 'avatar-stonks-up': {
      const arrowSize =
        size === '2xs' || size === 'xs' ? 10 : size === 'sm' ? 14 : 18
      return (
        <ArrowBadgeSvg
          direction="up"
          className="absolute"
          style={{
            right: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            bottom: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            width: arrowSize,
            height: arrowSize,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
        />
      )
    }
    case 'avatar-stonks-down': {
      const arrowSize =
        size === '2xs' || size === 'xs' ? 10 : size === 'sm' ? 14 : 18
      return (
        <ArrowBadgeSvg
          direction="down"
          className="absolute"
          style={{
            right: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            bottom: size === '2xs' || size === 'xs' ? -2 : size === 'sm' ? -3 : -4,
            width: arrowSize,
            height: arrowSize,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
          }}
        />
      )
    }
    case 'avatar-stonks-meme': {
      const memeSize =
        size === '2xs' || size === 'xs' ? 17 : size === 'sm' ? 27 : 37
      return (
        <StonksMemeArrowSvg
          className="absolute pointer-events-none"
          style={{
            left: '65%',
            top: '70%',
            transform: 'translate(-50%, -50%)',
            width: memeSize,
            height: memeSize,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            zIndex: 10,
          }}
        />
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

/**
 * Trump/MAGA-style cap with curved brim that goes DOWN on the sides.
 * From front view: center brim faces viewer, sides curve down and away.
 * The brim connects flush to the crown base.
 */
export const TrumpStyleCap2 = ({ team }: { team: 'red' | 'green' }) => {
  const colors =
    team === 'red'
      ? {
          main: '#DC2626',
          light: '#EF4444',
          dark: '#991B1B',
          accent: '#FEE2E2',
          darker: '#7F1D1D',
        }
      : {
          main: '#16A34A',
          light: '#22C55E',
          dark: '#14532D',
          accent: '#DCFCE7',
          darker: '#166534',
        }

  return (
    <svg viewBox="0 0 32 24" className="h-full w-full">
      <defs>
        {/* Gradient for crown 3D effect */}
        <linearGradient id={`crown-grad-${team}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colors.light} />
          <stop offset="50%" stopColor={colors.main} />
          <stop offset="100%" stopColor={colors.dark} />
        </linearGradient>
        {/* Gradient for brim top surface */}
        <linearGradient id={`brim-top-${team}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={colors.dark} />
          <stop offset="100%" stopColor={colors.darker} />
        </linearGradient>
      </defs>

      {/* Crown - simple dome shape */}
      <ellipse cx="16" cy="10" rx="11" ry="8" fill={`url(#crown-grad-${team})`} />

      {/* Front panel - gives structured cap look */}
      <path
        d="M6 11 Q6 5 16 4 Q26 5 26 11 Q26 13 16 13 Q6 13 6 11 Z"
        fill={colors.main}
      />

      {/* Button on top */}
      <circle cx="16" cy="3" r="1.2" fill={colors.dark} />

      {/* Seam line */}
      <path
        d="M16 3 L16 12"
        stroke={colors.darker}
        strokeWidth="0.4"
        opacity="0.5"
      />

      {/* Highlight on dome */}
      <ellipse cx="13" cy="7" rx="4" ry="2" fill={colors.accent} opacity="0.25" />

      {/*
        BRIM - The key geometry:
        - Top edge (where it meets crown at y=14): gentle curve
        - Bottom edge: MORE dramatic curve, dipping down on sides
        - This creates the "cupped" MAGA look where sides go DOWN
      */}

      {/* Brim top surface - visible from front */}
      <path
        d="M2 14
           Q4 13.5 8 13
           Q12 12.5 16 12.5
           Q20 12.5 24 13
           Q28 13.5 30 14
           Q28 16 24 17.5
           Q20 18.5 16 18.5
           Q12 18.5 8 17.5
           Q4 16 2 14
           Z"
        fill={`url(#brim-top-${team})`}
      />

      {/* Brim edge/underside - visible on the curved down sides */}
      {/* Left side edge - more visible because brim curves down */}
      <path
        d="M2 14
           Q3 15.5 5 17
           Q6 18 8 17.5
           Q4 16 2 14
           Z"
        fill={colors.darker}
      />

      {/* Right side edge - more visible because brim curves down */}
      <path
        d="M30 14
           Q29 15.5 27 17
           Q26 18 24 17.5
           Q28 16 30 14
           Z"
        fill={colors.darker}
      />

      {/* Brim front edge - thin line showing thickness at center */}
      <path
        d="M8 17.5 Q12 18.5 16 18.5 Q20 18.5 24 17.5 Q20 19 16 19 Q12 19 8 17.5 Z"
        fill={colors.darker}
        opacity="0.7"
      />

      {/* Subtle highlight on brim center (facing viewer) */}
      <ellipse cx="16" cy="15" rx="5" ry="1.5" fill={colors.accent} opacity="0.15" />
    </svg>
  )
}

/**
 * Trump/MAGA-style cap with proper perspective-based curved brim.
 *
 * KEY INSIGHT: The curved brim effect comes from PERSPECTIVE:
 * - When you look at a cap from the front, the brim appears to "wrap around"
 * - Center of brim is closer to viewer, sides curve away
 * - This creates the illusion that the sides dip down
 *
 * SVG approach uses TWO curves:
 * 1. TOP curve (where brim meets crown): relatively flat, follows crown base
 * 2. BOTTOM curve (outer edge of brim): MORE curved, dipping down significantly at sides
 *
 * The space between these curves IS the visible brim surface:
 * - THICK in the middle (brim facing you)
 * - THIN at the edges (brim curving away)
 */
export const TrumpStyleCap4 = ({ team }: { team: 'red' | 'green' }) => {
  const colors =
    team === 'red'
      ? {
          main: '#DC2626',
          light: '#EF4444',
          dark: '#991B1B',
          accent: '#FEE2E2',
          darker: '#7F1D1D',
        }
      : {
          main: '#16A34A',
          light: '#22C55E',
          dark: '#14532D',
          accent: '#DCFCE7',
          darker: '#166534',
        }

  return (
    <svg viewBox="0 0 32 24" className="h-full w-full">
      <defs>
        {/* Gradient for crown 3D effect */}
        <linearGradient
          id={`cap4-crown-${team}`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor={colors.light} />
          <stop offset="50%" stopColor={colors.main} />
          <stop offset="100%" stopColor={colors.dark} />
        </linearGradient>
        {/* Gradient for brim - darker at edges to enhance 3D */}
        <linearGradient
          id={`cap4-brim-${team}`}
          x1="50%"
          y1="0%"
          x2="50%"
          y2="100%"
        >
          <stop offset="0%" stopColor={colors.dark} />
          <stop offset="60%" stopColor={colors.darker} />
          <stop offset="100%" stopColor={colors.darker} />
        </linearGradient>
      </defs>

      {/* === CROWN === */}
      {/* Main dome */}
      <ellipse
        cx="16"
        cy="9"
        rx="10"
        ry="7"
        fill={`url(#cap4-crown-${team})`}
      />

      {/* Front panel - structured cap look */}
      <path
        d="M7 10 Q7 5 16 4 Q25 5 25 10 Q25 12 16 12 Q7 12 7 10 Z"
        fill={colors.main}
      />

      {/* Button on top */}
      <circle cx="16" cy="3" r="1" fill={colors.dark} />

      {/* Center seam */}
      <line
        x1="16"
        y1="3"
        x2="16"
        y2="11"
        stroke={colors.darker}
        strokeWidth="0.3"
        opacity="0.4"
      />

      {/* Highlight on dome */}
      <ellipse cx="13" cy="6" rx="3" ry="1.5" fill={colors.accent} opacity="0.2" />

      {/* === BRIM - The key geometry === */}
      {/*
        Two curves create the perspective effect:
        - Top edge: y=12 at center, y=13 at edges (slight curve following crown)
        - Bottom edge: y=16 at center, y=19 at edges (dramatic downward curve)

        The DIFFERENCE between these curves is what you SEE as the brim surface:
        - Center: 16-12 = 4 units thick (facing viewer)
        - Edges: 19-13 = 6 units thick BUT angled away, appears thinner
      */}

      {/* Brim surface - main visible area */}
      <path
        d={`
          M 1 13
          Q 5 12.5, 10 12
          Q 13 11.8, 16 11.8
          Q 19 11.8, 22 12
          Q 27 12.5, 31 13
          Q 28 16, 24 18
          Q 20 19.5, 16 19.5
          Q 12 19.5, 8 18
          Q 4 16, 1 13
          Z
        `}
        fill={`url(#cap4-brim-${team})`}
      />

      {/* Left brim edge - visible because of perspective curve down */}
      <path
        d={`
          M 1 13
          Q 2 15, 4 17
          Q 5 18.5, 8 18
          Q 4 16, 1 13
          Z
        `}
        fill={colors.darker}
        opacity="0.8"
      />

      {/* Right brim edge - visible because of perspective curve down */}
      <path
        d={`
          M 31 13
          Q 30 15, 28 17
          Q 27 18.5, 24 18
          Q 28 16, 31 13
          Z
        `}
        fill={colors.darker}
        opacity="0.8"
      />

      {/* Brim front lip - thin edge at center showing thickness */}
      <path
        d="M 8 18 Q 12 19.5, 16 19.5 Q 20 19.5, 24 18 Q 20 20, 16 20 Q 12 20, 8 18 Z"
        fill={colors.darker}
        opacity="0.6"
      />

      {/* Highlight on brim center (facing viewer) */}
      <ellipse cx="16" cy="14" rx="4" ry="1.2" fill={colors.accent} opacity="0.15" />
    </svg>
  )
}
