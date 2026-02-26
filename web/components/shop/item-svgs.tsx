/** Canonical SVG art for shop items — one definition, used in both avatar and shop preview. */
import clsx from 'clsx'
import { useId } from 'react'

type SvgProps = { className?: string; style?: React.CSSProperties }

// =============================================================================
// BORDERS & EFFECTS
// =============================================================================

/** Black hole with accretion disk and swirling matter. */
export function BlackHoleSvg(props: SvgProps) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 64 64">
      <defs>
        <linearGradient id={`bh-acc-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="30%" stopColor="#ec4899" />
          <stop offset="60%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id={`bh-void-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" />
          <stop offset="70%" stopColor="#0a0010" />
          <stop offset="100%" stopColor="#1a0030" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`bh-glow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="65%" stopColor="transparent" />
          <stop offset="85%" stopColor="#7c3aed" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.05" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#bh-glow-${uid})`} />
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke={`url(#bh-acc-${uid})`} strokeWidth="4" opacity="0.8" transform="rotate(-20 32 32)" />
      <ellipse cx="32" cy="32" rx="24" ry="8" fill="none" stroke="#f472b6" strokeWidth="2" opacity="0.6" transform="rotate(-20 32 32)" />
      <ellipse cx="32" cy="32" rx="20" ry="6" fill="none" stroke="#c084fc" strokeWidth="1.5" opacity="0.5" transform="rotate(-20 32 32)" />
      <path d="M8 32 Q16 20 32 18 Q48 16 56 28" stroke="#f97316" strokeWidth="3" fill="none" opacity="0.7" strokeLinecap="round" />
      <path d="M56 32 Q48 44 32 46 Q16 48 8 36" stroke="#a855f7" strokeWidth="3" fill="none" opacity="0.7" strokeLinecap="round" />
      <path d="M32 4 Q44 8 52 20 Q56 32 48 44" stroke="#ec4899" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />
      <path d="M32 60 Q20 56 12 44 Q8 32 16 20" stroke="#8b5cf6" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />
      <circle cx="12" cy="28" r="2" fill="#fbbf24" opacity="0.9" />
      <circle cx="52" cy="36" r="2" fill="#fb923c" opacity="0.9" />
      <circle cx="20" cy="40" r="1.5" fill="#f472b6" opacity="0.8" />
      <circle cx="44" cy="24" r="1.5" fill="#c084fc" opacity="0.8" />
      <circle cx="6" cy="20" r="1" fill="#fff" opacity="0.9" />
      <circle cx="58" cy="44" r="1" fill="#fff" opacity="0.9" />
      <circle cx="24" cy="6" r="0.8" fill="#e9d5ff" opacity="0.8" />
      <circle cx="40" cy="58" r="0.8" fill="#fce7f3" opacity="0.8" />
      <circle cx="10" cy="48" r="0.6" fill="#ddd6fe" opacity="0.7" />
      <circle cx="54" cy="16" r="0.6" fill="#fbcfe8" opacity="0.7" />
    </svg>
  )
}

/** Flame cluster SVG. Pass animate={true} for full-scale flames with transitions. */
export function FireFlamesSvg({
  animate,
  ...props
}: SvgProps & { animate?: boolean }) {
  return (
    <svg {...props} viewBox="0 0 80 80" fill="none">
      {/* Top flame cluster — ~4.5 o'clock on border */}
      <path
        d="M60,59 C62,59 64,58 66,55 C68,51 66,47 65,44 C64,47 62,51 60,53 C58,55 59,57 60,59Z"
        fill="#f97316"
        className={clsx(
          'opacity-90 transition-transform duration-300 origin-[60px_59px]',
          animate && 'scale-110'
        )}
      />
      <path
        d="M56,59 C58,59 60,58 61,56 C61,53 60,51 59,49 C58,51 57,53 55,55 C55,57 55,58 56,59Z"
        fill="#dc2626"
        className={clsx(
          'opacity-80 transition-transform duration-500 origin-[56px_59px]',
          animate && 'scale-110'
        )}
      />
      <path
        d="M64,53 C65,53 66,52 67,50 C68,48 67,46 66.5,45 C66,46 65,48 64,49 C63,50 63.5,52 64,53Z"
        fill="#fbbf24"
        className={clsx(
          'opacity-70 transition-transform duration-700 origin-[64px_53px]',
          animate && 'scale-125'
        )}
      />
      {/* Mini flame cluster — ~5 o'clock on border */}
      <path
        d="M54,65 C56,65 57,64 58,62 C59,60 58,58 57,56 C57,58 56,60 55,61 C54,63 54,64 54,65Z"
        fill="#f97316"
        className={clsx(
          'opacity-85 transition-transform duration-300 origin-[54px_65px]',
          animate && 'scale-110'
        )}
      />
      <path
        d="M51,66 C52,66 53,65 54,64 C54,62 53,61 53,60 C52,61 52,62 51,63 C50,64 51,65 51,66Z"
        fill="#dc2626"
        className={clsx(
          'opacity-75 transition-transform duration-500 origin-[51px_66px]',
          animate && 'scale-110'
        )}
      />
      <path
        d="M57,61 C58,61 58,60 59,59 C59,58 58,57 58,56 C58,57 57,58 57,59 C57,60 57,60 57,61Z"
        fill="#fbbf24"
        className={clsx(
          'opacity-65 transition-transform duration-700 origin-[57px_61px]',
          animate && 'scale-125'
        )}
      />
      {/* Primary flame cluster — ~5.5 o'clock, spilling right below photo frame */}
      <path
        d="M56,70 C54,70 52,69 51,67 C51,64 52,62 53,60 C54,63 55,65 56,67 C57,68 57,69 56,70Z"
        fill="#f59e0b"
        className={clsx(
          'opacity-75 transition-transform duration-[400ms] origin-[56px_70px]',
          animate && 'scale-110'
        )}
      />
      <path
        d="M52,72 C50,72 48,71 48,69 C47,66 48,64 49,62 C50,65 51,67 52,69 C52,70 52,71 52,72Z"
        fill="#ea580c"
        className={clsx(
          'opacity-75 transition-transform duration-[400ms] origin-[52px_72px]',
          animate && 'scale-110'
        )}
      />
      <path
        d="M52,72 C54,72 56,71 58,68 C60,64 58,60 57,57 C56,60 54,64 52,66 C50,68 51,70 52,72Z"
        fill="#f97316"
        className={clsx(
          'opacity-90 transition-transform duration-300 origin-[52px_72px]',
          animate && 'scale-110'
        )}
      />
      <path
        d="M56,66 C57,66 58,65 59,63 C60,61 59,59 58.5,58 C58,59 57,61 56,62 C55,63 55.5,65 56,66Z"
        fill="#fbbf24"
        className={clsx(
          'opacity-70 transition-transform duration-700 origin-[56px_66px]',
          animate && 'scale-125'
        )}
      />
    </svg>
  )
}

/** Single angel wing. Render twice (once with scaleX(-1)) for a pair. */
export function AngelWingSvg(props: SvgProps) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 16 44">
      {/* Flight feathers (back layer) */}
      <path
        d="M16 12 C 10.5 2 3.5 4 2.5 12 C 2.1 18 2.1 24 2.5 28 L 4.5 29 L 3.5 36 L 7 38 L 6 44 C 11 40 15 32 16 22 Z"
        fill="#FFFFFF"
        stroke="#CBD5E1"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      {/* Secondary feathers */}
      <path
        d="M16 13 C 11.5 5 6 6 5 13 C 4.5 18 5 21 6 25 C 10 23 13.5 22 16 20 Z"
        fill="#E2E8F0"
      />
      {/* Tertiary feathers */}
      <path
        d="M16 13 C 12.5 7 8.5 8 7.5 13 C 7.5 16 8 18.5 9 21 C 12 19.5 14.5 19 16 18 Z"
        fill="#E5E7EB"
      />
      {/* Shoulder coverts */}
      <path
        d="M16 13 C 14.2 9.5 11.5 9.5 10.5 12 C 10.5 14 11 15.5 12 17 C 13.5 16.5 15 16.5 16 16 Z"
        fill="#F1F5F9"
      />
    </svg>
  )
}

// =============================================================================
// ACCESSORIES
// =============================================================================

/** Monocle — gold-rimmed lens with glass reflection. */
export function MonocleSvg(props: SvgProps) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="rgba(200,220,255,0.15)" stroke="#D4AF37" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#B8860B" strokeWidth="0.5" />
      <ellipse cx="9" cy="9" rx="3" ry="2" fill="rgba(255,255,255,0.5)" />
    </svg>
  )
}

/** Crystal ball with golden cradle and base. */
export function CrystalBallSvg(props: SvgProps) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 24 24">
      <defs>
        <radialGradient id={`crystal-${uid}`} cx="30%" cy="30%">
          <stop offset="0%" stopColor="#E9D5FF" />
          <stop offset="40%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#6D28D9" />
        </radialGradient>
      </defs>
      <ellipse cx="12" cy="22.5" rx="6" ry="1.5" fill="#8B6914" />
      <rect x="9.5" y="19" width="5" height="3.5" rx="0.5" fill="#B8860B" />
      <path d="M5 16 Q5 20.5 12 20.5 Q19 20.5 19 16" fill="#D4AF37" />
      <circle cx="12" cy="9.5" r="8.5" fill={`url(#crystal-${uid})`} />
      <circle cx="12" cy="9.5" r="5.5" fill="rgba(139,92,246,0.3)" />
      <circle cx="9" cy="6.5" r="2" fill="rgba(255,255,255,0.6)" />
      <circle cx="7" cy="9" r="0.8" fill="rgba(255,255,255,0.4)" />
    </svg>
  )
}

/** Disguise — Groucho Marx glasses with big nose and bushy brows. */
export function DisguiseSvg(props: SvgProps) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 32 22">
      <circle cx="8" cy="8" r="6" fill="rgba(200,220,255,0.2)" stroke="#1F2937" strokeWidth="2" />
      <circle cx="24" cy="8" r="6" fill="rgba(200,220,255,0.2)" stroke="#1F2937" strokeWidth="2" />
      <path d="M14 8 Q16 6 18 8" stroke="#1F2937" strokeWidth="2" fill="none" />
      <line x1="2" y1="8" x2="0" y2="7" stroke="#1F2937" strokeWidth="1.5" />
      <line x1="30" y1="8" x2="32" y2="7" stroke="#1F2937" strokeWidth="1.5" />
      <ellipse cx="16" cy="15" rx="4" ry="5" fill="#FBBF8E" />
      <ellipse cx="16" cy="16" rx="3.5" ry="4" fill="#F5A67A" />
      <ellipse cx="14.5" cy="13" rx="1.5" ry="2" fill="rgba(255,255,255,0.3)" />
      <ellipse cx="14.5" cy="18" rx="1" ry="0.8" fill="#E08B65" />
      <ellipse cx="17.5" cy="18" rx="1" ry="0.8" fill="#E08B65" />
      <path d="M3 3 Q8 1 13 4" stroke="#4B3621" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M19 4 Q24 1 29 3" stroke="#4B3621" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/** Arrow badge — circular badge with up or down arrow. */
export function ArrowBadgeSvg({
  direction,
  ...props
}: SvgProps & { direction: 'up' | 'down' }) {
  const uid = useId().replace(/:/g, '')
  const isUp = direction === 'up'
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 24 24">
      <defs>
        <linearGradient
          id={`arrow-${uid}`}
          x1="0%"
          y1={isUp ? '100%' : '0%'}
          x2="100%"
          y2={isUp ? '0%' : '100%'}
        >
          <stop offset="0%" stopColor={isUp ? '#15803d' : '#fca5a5'} />
          <stop offset="50%" stopColor={isUp ? '#22c55e' : '#ef4444'} />
          <stop offset="100%" stopColor={isUp ? '#4ade80' : '#b91c1c'} />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="#1f2937" />
      {isUp ? (
        <path
          d="M12 4 L18 12 L14 12 L14 20 L10 20 L10 12 L6 12 Z"
          fill={`url(#arrow-${uid})`}
        />
      ) : (
        <path
          d="M12 20 L18 12 L14 12 L14 4 L10 4 L10 12 L6 12 Z"
          fill={`url(#arrow-${uid})`}
        />
      )}
    </svg>
  )
}

/** Iconic diagonal STONKS meme arrow with 3D depth. */
export function StonksMemeArrowSvg(props: SvgProps) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 64 64">
      <defs>
        <linearGradient
          id={`stonks-top-${uid}`}
          x1="0%"
          y1="100%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <linearGradient
          id={`stonks-side-${uid}`}
          x1="0%"
          y1="100%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      {/* 3D Depth/Side */}
      <path
        d="M27 50L47 21L43 17L62 6L57 28L53 24L33 54Z"
        fill={`url(#stonks-side-${uid})`}
      />
      {/* Main Face */}
      <path
        d="M25 48L45 19L41 15L60 4L55 26L51 22L31 52Z"
        fill={`url(#stonks-top-${uid})`}
      />
    </svg>
  )
}

// =============================================================================
// HATS (Custom SVGs)
// =============================================================================

/** Single bull horn. Render twice (second with scaleX(-1)) for a pair. */
export function BullHornSvg(props: SvgProps) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 32 24">
      <defs>
        <linearGradient
          id={`bull-horn-${uid}`}
          gradientUnits="userSpaceOnUse"
          x1="30"
          y1="20"
          x2="4"
          y2="4"
        >
          <stop offset="0%" stopColor="#D4A574" />
          <stop offset="35%" stopColor="#8B6914" />
          <stop offset="70%" stopColor="#5C3D1A" />
          <stop offset="100%" stopColor="#2C1A0A" />
        </linearGradient>
      </defs>
      <path
        d="M30 23 L16 23 C8 23 3 20 3 4 C3 8 6 13 10 16 C14 18 20 18 30 15 Z"
        fill={`url(#bull-horn-${uid})`}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Single bear ear with fur texture. Use side prop for gradient direction. */
export function BearEarSvg({
  side = 'left',
  ...props
}: SvgProps & { side?: 'left' | 'right' }) {
  const uid = useId().replace(/:/g, '')
  const isLeft = side === 'left'
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 24 24">
      <defs>
        <radialGradient
          id={`bear-fur-${uid}`}
          cx={isLeft ? '40%' : '60%'}
          cy="30%"
          r="60%"
        >
          <stop offset="0%" stopColor="#92400E" />
          <stop offset="70%" stopColor="#78350F" />
          <stop offset="100%" stopColor="#451A03" />
        </radialGradient>
        <radialGradient id={`bear-inner-${uid}`} cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#FECACA" />
          <stop offset="60%" stopColor="#F5B7B1" />
          <stop offset="100%" stopColor="#E5A39A" />
        </radialGradient>
      </defs>
      <ellipse cx="12" cy="13" rx="10" ry="9" fill={`url(#bear-fur-${uid})`} />
      <ellipse cx="5" cy="11" rx="2.5" ry="2" fill="#92400E" opacity="0.7" />
      <ellipse cx="19" cy="11" rx="2.5" ry="2" fill="#92400E" opacity="0.7" />
      <ellipse cx="12" cy="6" rx="3" ry="2" fill="#92400E" opacity="0.6" />
      <ellipse
        cx="12"
        cy="13"
        rx="5.5"
        ry="5"
        fill={`url(#bear-inner-${uid})`}
      />
      <ellipse
        cx={isLeft ? 10 : 14}
        cy="11"
        rx="2"
        ry="1.5"
        fill="rgba(255,255,255,0.3)"
      />
    </svg>
  )
}

/** Single cat ear. Render twice (second mirrored) for a pair. */
export function CatEarSvg(props: SvgProps) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 24 18">
      <path
        d="M3 18 C3 10, 8 5, 12 0 C16 5, 21 10, 21 18 Q12 15 3 18 Z"
        fill="#4B5563"
        stroke="#374151"
        strokeWidth="0.8"
      />
      <path
        d="M6 17 C6 10, 9 5, 12 4 C15 5, 18 10, 18 17 Q12 16 6 17 Z"
        fill="#F472B6"
      />
      <path
        d="M10 14 Q11 9 12 5"
        stroke="#FBCFE8"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  )
}

/** Santa hat — tapered cone with pom pom at tip. */
export function SantaHatSvg(props: SvgProps) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 28 24">
      <defs>
        <linearGradient
          id={`santa-${uid}`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#EF4444" />
          <stop offset="100%" stopColor="#DC2626" />
        </linearGradient>
      </defs>
      <path
        d="M5 16C5 6 8 2 14 2C20 2 25 3 27 7C27 10 25 11 23 10.5C23 8 20 5 17 5C13 5 20 10 20 16H5Z"
        fill={`url(#santa-${uid})`}
      />
      <path
        d="M17 5C19 7 21 9 22 10.5"
        fill="none"
        stroke="#B91C1C"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M2 18C2 15.5 5 14 13 14C21 14 24 15.5 24 18C24 20.5 21 22 13 22C5 22 2 20.5 2 18Z"
        fill="white"
      />
      <circle cx="25" cy="10" r="3.5" fill="white" />
    </svg>
  )
}

/** Single bunny ear. Render twice (once mirrored) for a pair. */
export function BunnyEarSvg(props: SvgProps) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 20 30">
      <ellipse cx="10" cy="15" rx="8" ry="14" fill="#F5F5F5" />
      <ellipse cx="10" cy="16" rx="4" ry="10" fill="#FBCFE8" />
    </svg>
  )
}

/** Wizard hat — tall cone with star. */
export function WizardHatSvg(props: SvgProps) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 24 24">
      <ellipse cx="12" cy="19" rx="11" ry="3.5" fill="#6D28D9" />
      <polygon points="12,1 5,19 19,19" fill="#8B5CF6" />
      <circle cx="11" cy="12" r="1.2" fill="#FBBF24" opacity="0.9" />
    </svg>
  )
}

/** Tinfoil hat — crinkly aluminum cone. */
export function TinfoilHatSvg(props: SvgProps) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 24 24">
      <path
        d="M12 1.5L22 20l-2-2-2 3-2-3-2 3-2-3-2 3-2-3-2 3-4-2z"
        fill="#94A3B8"
      />
      <path
        d="M12 1.5L22 20l-2-2-2 3-2-3-2 3V11z"
        fill="#64748B"
        opacity="0.3"
      />
      <path
        d="M12 1.5L2 20l2-2 2 3 2-3V9z"
        fill="#E2E8F0"
        opacity="0.25"
      />
      <path
        d="M12 1.5l3 8-5 4 3 6.5"
        stroke="#E2E8F0"
        strokeWidth="0.7"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M12 1.5l-4 7 6 5-4 4.5"
        stroke="#475569"
        strokeWidth="0.7"
        fill="none"
        strokeLinejoin="round"
        opacity="0.8"
      />
      <path
        d="M4 17.5l5-2 8 2.5 4-1.5"
        stroke="#CBD5E1"
        strokeWidth="0.5"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M12 1.5l1.5 4-3 0z" fill="#CBD5E1" opacity="0.8" />
    </svg>
  )
}

/** Jester hat — tri-flap with gold bells. */
export function JesterHatSvg(props: SvgProps) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 24 24">
      {/* Right Flap (Green) */}
      <path d="M12 21L15 13L22 6L12 21Z" fill="#16A34A" />
      <path d="M12 21L22 6L19 16L12 21Z" fill="#14532D" />
      {/* Left Flap (Purple) */}
      <path d="M12 21L9 13L5 7L12 21Z" fill="#6366F1" />
      <path d="M12 21L5 7L5 16L12 21Z" fill="#4F46E5" />
      <path d="M5 7L5 10L2 6L5 7Z" fill="#818CF8" />
      {/* Center Flap (Red) */}
      <path d="M12 21L9 13L12 2L12 21Z" fill="#991B1B" />
      <path d="M12 21L15 13L12 2L12 21Z" fill="#DC2626" />
      {/* Headband */}
      <rect x="5" y="19" width="14" height="4" rx="2" fill="#FBBF24" />
      <rect
        x="5"
        y="19"
        width="14"
        height="4"
        rx="2"
        fill="none"
        stroke="#D97706"
        strokeWidth="0.5"
      />
      {/* Gold Bells */}
      <circle cx="2" cy="6" r="1.5" fill="#FBBF24" />
      <circle cx="22" cy="6" r="1.5" fill="#FBBF24" />
      <circle cx="12" cy="2" r="1.5" fill="#FBBF24" />
    </svg>
  )
}

/** Fedora hat. */
export function FedoraSvg(props: SvgProps) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 24 24">
      <path d="M6 16 Q6 8 12 8 Q18 8 18 16Z" fill="#78716C" />
      <path
        d="M8 14 Q12 10 16 14"
        stroke="#57534E"
        strokeWidth="0.8"
        fill="none"
      />
      <ellipse cx="12" cy="16" rx="11" ry="3" fill="#78716C" />
      <rect x="6" y="14" width="12" height="1.5" rx="0.5" fill="#44403C" />
    </svg>
  )
}

/** Single devil horn. Use side prop for left/right. */
export function DevilHornSvg({
  side = 'left',
  ...props
}: SvgProps & { side?: 'left' | 'right' }) {
  return (
    <svg className={props.className} style={props.style} viewBox="0 0 16 16">
      {side === 'left' ? (
        <>
          <path d="M0 16C0 8 8 2 14 1C11 4 6 12 5 16H0Z" fill="#DC2626" />
          <path
            d="M5 16C6 12 11 4 14 1C10 6 6 12 5 16Z"
            fill="#991B1B"
          />
        </>
      ) : (
        <>
          <path
            d="M16 16C16 8 8 2 2 1C5 4 10 12 11 16H16Z"
            fill="#DC2626"
          />
          <path
            d="M11 16C10 12 5 4 2 1C6 6 10 12 11 16Z"
            fill="#991B1B"
          />
        </>
      )}
    </svg>
  )
}
