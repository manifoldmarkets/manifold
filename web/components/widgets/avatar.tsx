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
    // Get active avatar overlay (hat)
    const activeOverlay = getActiveAvatarOverlay(entitlements)
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
      isUserFresh || activeOverlay || hasGoldenBorder || hasAngelWings

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
              hasGoldenBorder && 'relative ring-2 ring-amber-400'
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
              hasGoldenBorder && 'relative ring-2 ring-amber-400'
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
