import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'

export default function ShopPreviewPage() {
  const user = useUser()
  const avatarUrl = user?.avatarUrl
  const username = user?.username

  return (
    <Page trackPageView="shop preview">
      <Col className="mx-auto max-w-7xl gap-6 p-4">
        {/* ═══════════════════════════════════════════
            BLACK HOLE BORDER — Light Mode Fix Workshop
            ═══════════════════════════════════════════ */}
        <Title>Black Hole Border — Light Mode Fix Workshop</Title>
        <p className="text-ink-500 text-sm">
          Each version shown on forced light (left) and forced dark (right)
          hovercard backgrounds. Real proportions: 64px SVG over 48px avatar.
        </p>

        <div className="flex flex-col gap-8">
          <BlackHolePair
            label="Current"
            description="Original — great in dark, washed out in light"
            svgContent={<BlackHoleCurrent />}
            avatarUrl={avatarUrl}
            username={username}
          />
          <BlackHolePair
            label="E: Cosmic Purple"
            description="Deep purple/indigo dominant, premium feel"
            svgContent={<BlackHoleVersionE />}
            avatarUrl={avatarUrl}
            username={username}
          />
          <BlackHolePair
            label="F: Subtle Veil"
            description="Light transparent dark backdrop + current's warm accretion gradient"
            svgContent={<BlackHoleVersionF />}
            avatarUrl={avatarUrl}
            username={username}
          />
          <BlackHolePair
            label="G: Warm Cosmic"
            description="Warm yellow/orange/pink accents that pop on white, purple haze for dark"
            svgContent={<BlackHoleVersionG />}
            avatarUrl={avatarUrl}
            username={username}
          />
          <BlackHolePair
            label="H: Adaptive Glow"
            description="Tight concentrated glow, color in disk/streams not background"
            svgContent={<BlackHoleVersionH />}
            avatarUrl={avatarUrl}
            username={username}
          />
          <BlackHolePair
            label="I: Deep Galaxy"
            description="Window into deep space — moderate dark backdrop, warm hot spots, scattered stars"
            svgContent={<BlackHoleVersionI />}
            avatarUrl={avatarUrl}
            username={username}
          />
        </div>

        {/* ═══════════════════════════════════════════
            Old cap previews (kept for reference)
            ═══════════════════════════════════════════ */}
        <div className="border-ink-200 mt-12 border-t pt-8">
          <Title>Baseball Cap Brim Fixes — Round 2</Title>

          <div className="text-ink-500 text-sm font-semibold">
            Black Taper — Fixed left brim + smooth right taper
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <CapPreview label="Taper A" description="Standard left, smooth taper">
              <BlackTaperA />
            </CapPreview>
            <CapPreview label="Taper B" description="Wider left (x=-18)">
              <BlackTaperB />
            </CapPreview>
            <CapPreview label="Taper C" description="With dashed stitching">
              <BlackTaperC />
            </CapPreview>
            <CapPreview label="Taper D" description="Shorter left (x=-10)">
              <BlackTaperD />
            </CapPreview>
          </div>

          <div className="text-ink-500 mt-6 text-sm font-semibold">
            Black Tuck — Fixed left connection + shadow strip
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <CapPreview label="Tuck A" description="Extended left, no bulge">
              <BlackTuckA />
            </CapPreview>
            <CapPreview label="Tuck B" description="Even wider + wide shadow">
              <BlackTuckB />
            </CapPreview>
            <CapPreview label="Tuck C" description="With dashed stitching">
              <BlackTuckC />
            </CapPreview>
            <CapPreview label="Tuck D" description="Thicker brim, medium ext">
              <BlackTuckD />
            </CapPreview>
          </div>

          <div className="text-ink-500 mt-6 text-sm font-semibold">
            Two-Tone Point — Extended right-side taper
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <CapPreview label="Point A" description="Point to x=70">
              <TwoTonePointA />
            </CapPreview>
            <CapPreview label="Point B" description="Point to x=75, wider">
              <TwoTonePointB />
            </CapPreview>
            <CapPreview label="Point C" description="x=70 + stitching lines">
              <TwoTonePointC />
            </CapPreview>
            <CapPreview label="Point D" description="x=72, thicker brim (y=68)">
              <TwoTonePointD />
            </CapPreview>
          </div>
        </div>
      </Col>
    </Page>
  )
}

/* ═══════════════════════════════════════════
   BLACK HOLE HOVERCARD PAIR — light + dark side by side
   ═══════════════════════════════════════════ */

function BlackHolePair(props: {
  label: string
  description: string
  svgContent: React.ReactNode
  avatarUrl?: string
  username?: string
}) {
  const { label, description, svgContent, avatarUrl, username } = props
  return (
    <Col className="gap-2">
      <div>
        <div className="font-bold">{label}</div>
        <div className="text-ink-500 text-xs">{description}</div>
      </div>
      <Row className="flex-wrap gap-4">
        <HovercardMock mode="light" svgContent={svgContent} avatarUrl={avatarUrl} username={username} />
        <HovercardMock mode="dark" svgContent={svgContent} avatarUrl={avatarUrl} username={username} />
      </Row>
    </Col>
  )
}

function HovercardMock(props: {
  mode: 'light' | 'dark'
  svgContent: React.ReactNode
  avatarUrl?: string
  username?: string
}) {
  const { mode, svgContent, avatarUrl, username } = props
  const isLight = mode === 'light'
  // Between real (64/-8) and exaggerated (74/-13) — split the difference
  const avatarSize = 48
  const bhSize = 69
  const bhMargin = -10
  return (
    <Col
      className="relative w-56 items-center gap-2 rounded-lg p-4 ring-1"
      style={{
        background: isLight ? '#ffffff' : '#1a1a2e',
        color: isLight ? '#1a1a2e' : '#e2e8f0',
        boxShadow: isLight
          ? '0 4px 12px rgba(0,0,0,0.1)'
          : '0 4px 12px rgba(0,0,0,0.5)',
        ringColor: isLight ? '#e2e8f0' : '#334155',
      }}
    >
      <div className="text-[10px] font-medium opacity-50">
        {isLight ? 'Light mode' : 'Dark mode'}
      </div>
      {/* Avatar + black hole — matches real Avatar component layout */}
      <div
        className="relative overflow-visible"
        style={{ width: avatarSize, height: avatarSize }}
      >
        {/* Black hole SVG — positioned exactly like BlackHoleDecoration */}
        <svg
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: bhSize,
            height: bhSize,
            marginLeft: bhMargin,
            marginTop: bhMargin,
            filter: 'drop-shadow(0 0 8px rgba(147, 51, 234, 0.5))',
          }}
          viewBox="0 0 64 64"
        >
          {svgContent}
        </svg>
        {/* Avatar image — fills container */}
        <img
          src={avatarUrl ?? '/logo.svg'}
          className="absolute inset-0 rounded-full object-cover"
          style={{
            width: avatarSize,
            height: avatarSize,
            border: '1px solid rgba(168, 85, 247, 0.4)',
              boxShadow: '0 0 6px rgba(147, 51, 234, 0.5)',
          }}
          alt=""
        />
      </div>
      <div className="text-xs font-medium">
        {username ? `@${username}` : '@username'}
      </div>
    </Col>
  )
}

/* ═══════════════════════════════════════════
   BLACK HOLE VERSIONS
   ═══════════════════════════════════════════ */

// Current version (for comparison)
function BlackHoleCurrent() {
  return (
    <g>
      <defs>
        <linearGradient id="bh-cur-accretion" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="30%" stopColor="#ec4899" />
          <stop offset="60%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id="bh-cur-outer-glow" cx="50%" cy="50%" r="50%">
          <stop offset="65%" stopColor="transparent" />
          <stop offset="85%" stopColor="#7c3aed" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.05" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#bh-cur-outer-glow)" />
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="url(#bh-cur-accretion)" strokeWidth="4" opacity="0.8" transform="rotate(-20 32 32)" />
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
    </g>
  )
}

// Version E: Cosmic Purple — deep purple/indigo dominant, premium and mysterious
function BlackHoleVersionE() {
  return (
    <g>
      <defs>
        <radialGradient id="bh-e-backdrop" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0c0020" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#1e0a3a" stopOpacity="0.7" />
          <stop offset="70%" stopColor="#2e1065" stopOpacity="0.5" />
          <stop offset="85%" stopColor="#4c1d95" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6d28d9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bh-e-accretion" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e879f9" />
          <stop offset="35%" stopColor="#c084fc" />
          <stop offset="65%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id="bh-e-inner-ring" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="50%" stopColor="#d8b4fe" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
        <radialGradient id="bh-e-outer-haze" cx="50%" cy="50%" r="50%">
          <stop offset="50%" stopColor="transparent" />
          <stop offset="70%" stopColor="#7c3aed" stopOpacity="0.5" />
          <stop offset="85%" stopColor="#6d28d9" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.1" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#bh-e-backdrop)" />
      <circle cx="32" cy="32" r="30" fill="url(#bh-e-outer-haze)" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="#7c3aed" strokeWidth="2.5" opacity="0.8" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="url(#bh-e-accretion)" strokeWidth="5" opacity="1" transform="rotate(-20 32 32)" />
      <ellipse cx="32" cy="32" rx="25" ry="9" fill="none" stroke="url(#bh-e-inner-ring)" strokeWidth="2" opacity="0.8" transform="rotate(-20 32 32)" />
      <ellipse cx="32" cy="32" rx="21" ry="7" fill="none" stroke="#c4b5fd" strokeWidth="1.5" opacity="0.7" transform="rotate(-20 32 32)" />
      <path d="M8 32 Q16 20 32 18 Q48 16 56 28" stroke="#e879f9" strokeWidth="3" fill="none" opacity="0.9" strokeLinecap="round" />
      <path d="M56 32 Q48 44 32 46 Q16 48 8 36" stroke="#8b5cf6" strokeWidth="3" fill="none" opacity="0.9" strokeLinecap="round" />
      <path d="M32 4 Q44 8 52 20 Q56 32 48 44" stroke="#a78bfa" strokeWidth="2.5" fill="none" opacity="0.75" strokeLinecap="round" />
      <path d="M32 60 Q20 56 12 44 Q8 32 16 20" stroke="#818cf8" strokeWidth="2.5" fill="none" opacity="0.75" strokeLinecap="round" />
      <circle cx="12" cy="28" r="2.5" fill="#f9a8d4" opacity="1" />
      <circle cx="52" cy="36" r="2.5" fill="#e879f9" opacity="1" />
      <circle cx="20" cy="40" r="2" fill="#f0abfc" opacity="1" />
      <circle cx="44" cy="24" r="2" fill="#d8b4fe" opacity="1" />
      <circle cx="6" cy="20" r="1.5" fill="#fff" opacity="1" />
      <circle cx="58" cy="44" r="1.5" fill="#fff" opacity="1" />
      <circle cx="24" cy="6" r="1.2" fill="#faf5ff" opacity="1" />
      <circle cx="40" cy="58" r="1.2" fill="#fdf4ff" opacity="1" />
      <circle cx="10" cy="48" r="0.8" fill="#f5d0fe" opacity="0.95" />
      <circle cx="54" cy="16" r="0.8" fill="#e9d5ff" opacity="0.95" />
    </g>
  )
}

// Version F: Subtle Veil — light transparent dark backdrop + current's warm accretion
function BlackHoleVersionF() {
  return (
    <g>
      <defs>
        <radialGradient id="bh-f-backdrop" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0c0020" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#1e0a3a" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2e1065" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bh-f-accretion" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="30%" stopColor="#ec4899" />
          <stop offset="60%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id="bh-f-outer-glow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="transparent" />
          <stop offset="85%" stopColor="#7c3aed" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.1" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#bh-f-backdrop)" />
      <circle cx="32" cy="32" r="30" fill="url(#bh-f-outer-glow)" />
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="url(#bh-f-accretion)" strokeWidth="4" opacity="0.85" transform="rotate(-20 32 32)" />
      <ellipse cx="32" cy="32" rx="24" ry="8" fill="none" stroke="#f472b6" strokeWidth="2" opacity="0.6" transform="rotate(-20 32 32)" />
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
    </g>
  )
}

// Version G: Warm Cosmic — warm accents pop on white, purple haze shines on dark
function BlackHoleVersionG() {
  return (
    <g>
      <defs>
        <linearGradient id="bh-g-accretion" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="25%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#ec4899" />
          <stop offset="75%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <radialGradient id="bh-g-haze" cx="50%" cy="50%" r="50%">
          <stop offset="40%" stopColor="transparent" />
          <stop offset="70%" stopColor="#db2777" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#bh-g-haze)" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="#ec4899" strokeWidth="2" opacity="0.4" />
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="url(#bh-g-accretion)" strokeWidth="5" opacity="1" transform="rotate(-20 32 32)" />
      <ellipse cx="32" cy="32" rx="25" ry="9" fill="none" stroke="#fdf2f8" strokeWidth="1.5" opacity="0.6" transform="rotate(-20 32 32)" />
      <path d="M8 32 Q16 20 32 18 Q48 16 56 28" stroke="#f59e0b" strokeWidth="3.5" fill="none" opacity="0.9" strokeLinecap="round" />
      <path d="M56 32 Q48 44 32 46 Q16 48 8 36" stroke="#d946ef" strokeWidth="3.5" fill="none" opacity="0.9" strokeLinecap="round" />
      <circle cx="12" cy="28" r="2.5" fill="#fcd34d" opacity="1" />
      <circle cx="52" cy="36" r="2.5" fill="#fb923c" opacity="1" />
      <circle cx="20" cy="40" r="2" fill="#f472b6" opacity="1" />
      <circle cx="44" cy="24" r="2" fill="#d8b4fe" opacity="1" />
      <circle cx="6" cy="20" r="1.5" fill="#fff" opacity="1" />
      <circle cx="58" cy="44" r="1.5" fill="#fff" opacity="1" />
    </g>
  )
}

// Version H: Adaptive Glow — tight concentrated glow, color in disk/streams
function BlackHoleVersionH() {
  return (
    <g>
      <defs>
        <linearGradient id="bh-h-accretion" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e879f9" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id="bh-h-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="transparent" />
          <stop offset="75%" stopColor="#a855f7" stopOpacity="0.5" />
          <stop offset="85%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#bh-h-core-glow)" />
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="url(#bh-h-accretion)" strokeWidth="4.5" opacity="1" transform="rotate(-20 32 32)" />
      <ellipse cx="32" cy="32" rx="22" ry="7" fill="none" stroke="#ddd6fe" strokeWidth="1.5" opacity="0.8" transform="rotate(-20 32 32)" />
      <path d="M8 32 Q16 20 32 18 Q48 16 56 28" stroke="#f0abfc" strokeWidth="3" fill="none" opacity="0.9" strokeLinecap="round" />
      <path d="M56 32 Q48 44 32 46 Q16 48 8 36" stroke="#818cf8" strokeWidth="3" fill="none" opacity="0.9" strokeLinecap="round" />
      <circle cx="12" cy="28" r="2" fill="#f0abfc" opacity="1" />
      <circle cx="52" cy="36" r="2" fill="#c084fc" opacity="1" />
      <circle cx="20" cy="40" r="1.5" fill="#e9d5ff" opacity="0.9" />
      <circle cx="44" cy="24" r="1.5" fill="#c7d2fe" opacity="0.9" />
      <circle cx="32" cy="6" r="1" fill="#fff" opacity="1" />
      <circle cx="32" cy="58" r="1" fill="#fff" opacity="1" />
    </g>
  )
}

// Version I: Deep Galaxy — window into deep space, warm hot spots, scattered stars
function BlackHoleVersionI() {
  return (
    <g>
      <defs>
        <radialGradient id="bh-i-window" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0c0020" stopOpacity="0.5" />
          <stop offset="70%" stopColor="#1e1b4b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#312e81" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bh-i-stream" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="40%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#bh-i-window)" />
      <ellipse cx="32" cy="32" rx="28" ry="10" fill="none" stroke="url(#bh-i-stream)" strokeWidth="4" opacity="0.9" transform="rotate(-20 32 32)" />
      <path d="M8 32 Q16 20 32 18 Q48 16 56 28" stroke="#f97316" strokeWidth="2.5" fill="none" opacity="0.8" strokeLinecap="round" />
      <path d="M56 32 Q48 44 32 46 Q16 48 8 36" stroke="#8b5cf6" strokeWidth="2.5" fill="none" opacity="0.8" strokeLinecap="round" />
      <circle cx="12" cy="28" r="2" fill="#fbbf24" opacity="1" />
      <circle cx="52" cy="36" r="2" fill="#f472b6" opacity="1" />
      <circle cx="20" cy="40" r="1.5" fill="#fff" opacity="0.9" />
      <circle cx="44" cy="24" r="1.5" fill="#fff" opacity="0.9" />
      <circle cx="10" cy="15" r="0.6" fill="#fff" opacity="0.8" />
      <circle cx="55" cy="50" r="0.7" fill="#fef08a" opacity="0.7" />
      <circle cx="25" cy="55" r="0.5" fill="#ddd6fe" opacity="0.6" />
      <circle cx="40" cy="10" r="0.6" fill="#fbcfe8" opacity="0.7" />
      <circle cx="5" cy="40" r="0.5" fill="#fff" opacity="0.5" />
      <circle cx="60" cy="20" r="0.5" fill="#fff" opacity="0.5" />
    </g>
  )
}

/* ═══════════════════════════════════════════
   CAP PREVIEW HELPERS (existing)
   ═══════════════════════════════════════════ */

function CapPreview({
  children,
  label,
  description,
}: {
  children: React.ReactNode
  label: string
  description: string
}) {
  return (
    <Col className="items-center gap-2">
      <div className="text-center">
        <div className="font-bold">{label}</div>
        <div className="text-ink-500 text-xs">{description}</div>
      </div>
      <svg width="140" height="140" viewBox="0 0 120 120">
        <circle cx="60" cy="70" r="40" fill="#e0e0e0" stroke="#ccc" strokeWidth="2" />
        <circle cx="48" cy="68" r="3" fill="#999" />
        <circle cx="72" cy="68" r="3" fill="#999" />
        <path d="M50 82 Q60 90 70 82" stroke="#999" strokeWidth="2" strokeLinecap="round" fill="none" />
        {children}
      </svg>
    </Col>
  )
}

/* ═══════════════════════════════════════════
   BLACK TAPER — fixed left side, smooth right taper
   ═══════════════════════════════════════════ */

function BlackTaperA() {
  return (
    <g transform="translate(35, 30)">
      <path
        d="M5,35 C5,35 -10,45 -15,55 C-20,65 10,65 45,70 C70,70 85,60 85,35 Q45,40 5,35Z"
        fill="#333"
        stroke="#111"
        strokeWidth="2"
      />
      <path
        d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z"
        fill="#333"
        stroke="#111"
        strokeWidth="2"
      />
      <g stroke="#111" strokeWidth="1" opacity="0.3" fill="none">
        <path d="M45,2 L45,45" />
        <path d="M45,2 C25,5 15,15 10,36" />
        <path d="M45,2 C65,5 75,15 80,36" />
      </g>
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#ffffff" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#111" />
    </g>
  )
}

function BlackTaperB() {
  return (
    <g transform="translate(35, 30)">
      <path
        d="M5,35 C5,35 -12,45 -18,55 C-24,65 10,65 45,70 C70,70 85,60 85,35 Q45,40 5,35Z"
        fill="#333"
        stroke="#111"
        strokeWidth="2"
      />
      <path
        d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z"
        fill="#333"
        stroke="#111"
        strokeWidth="2"
      />
      <g stroke="#111" strokeWidth="1" opacity="0.3" fill="none">
        <path d="M45,2 L45,45" />
        <path d="M45,2 C25,5 15,15 10,36" />
        <path d="M45,2 C65,5 75,15 80,36" />
      </g>
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#ffffff" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#111" />
    </g>
  )
}

function BlackTaperC() {
  return (
    <g transform="translate(35, 30)">
      <path
        d="M5,35 C5,35 -10,45 -15,55 C-20,65 10,65 45,70 C70,70 85,60 85,35 Q45,40 5,35Z"
        fill="#333"
        stroke="#111"
        strokeWidth="2"
      />
      <path d="M5,38 C5,38 -8,45 -12,53 C-16,62 10,62 45,67 C68,67 82,58 82,38" fill="none" stroke="#111" strokeWidth="1" opacity="0.4" strokeDasharray="2,2" />
      <path d="M5,41 C5,41 -6,45 -9,51 C-12,59 10,59 45,64 C66,64 79,56 79,41" fill="none" stroke="#111" strokeWidth="1" opacity="0.4" strokeDasharray="2,2" />
      <path
        d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z"
        fill="#333"
        stroke="#111"
        strokeWidth="2"
      />
      <g stroke="#111" strokeWidth="1" opacity="0.3" fill="none">
        <path d="M45,2 L45,45" />
        <path d="M45,2 C25,5 15,15 10,36" />
        <path d="M45,2 C65,5 75,15 80,36" />
      </g>
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#ffffff" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#111" />
    </g>
  )
}

function BlackTaperD() {
  return (
    <g transform="translate(35, 30)">
      <path
        d="M5,35 C5,35 -5,45 -10,55 C-15,65 10,65 45,70 C70,70 85,60 85,35 Q45,40 5,35Z"
        fill="#333"
        stroke="#111"
        strokeWidth="2"
      />
      <path
        d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z"
        fill="#333"
        stroke="#111"
        strokeWidth="2"
      />
      <g stroke="#111" strokeWidth="1" opacity="0.3" fill="none">
        <path d="M45,2 L45,45" />
        <path d="M45,2 C25,5 15,15 10,36" />
        <path d="M45,2 C65,5 75,15 80,36" />
      </g>
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#ffffff" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#111" />
    </g>
  )
}

/* ═══════════════════════════════════════════
   BLACK TUCK — fixed left, shadow strip, extended brim
   ═══════════════════════════════════════════ */

function BlackTuckA() {
  return (
    <g transform="translate(35, 30)">
      <path d="M5,35 C5,40 -10,45 -18,62 C-5,82 55,82 85,35 Q45,42 5,35Z" fill="#333" stroke="#111" strokeWidth="2" />
      <path d="M5,36 Q45,43 85,36 L85,38 Q45,45 5,38Z" fill="#111" opacity="0.5" />
      <path d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z" fill="#333" stroke="#111" strokeWidth="2" />
      <g stroke="#111" strokeWidth="1" opacity="0.3" fill="none">
        <path d="M45,0 L45,25" />
        <path d="M45,0 C25,5 5,15 5,25" />
        <path d="M45,0 C65,5 85,15 85,25" />
      </g>
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#ffffff" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#111" />
    </g>
  )
}

function BlackTuckB() {
  return (
    <g transform="translate(35, 30)">
      <path d="M5,35 C5,40 -12,45 -20,65 C-5,85 55,85 85,35 Q45,42 5,35Z" fill="#333" stroke="#111" strokeWidth="2" />
      <path d="M5,36 Q45,44 85,36 L85,41 Q45,49 5,41Z" fill="#111" opacity="0.6" />
      <path d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z" fill="#333" stroke="#111" strokeWidth="2" />
      <g stroke="#111" strokeWidth="1" opacity="0.3" fill="none">
        <path d="M45,0 L45,25" />
        <path d="M45,0 C25,5 5,15 5,25" />
        <path d="M45,0 C65,5 85,15 85,25" />
      </g>
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#ffffff" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#111" />
    </g>
  )
}

function BlackTuckC() {
  return (
    <g transform="translate(35, 30)">
      <path d="M5,35 C5,40 -10,45 -18,62 C-5,82 55,82 85,35 Q45,42 5,35Z" fill="#333" stroke="#111" strokeWidth="2" />
      <path d="M5,42 Q45,50 82,36" fill="none" stroke="#222" strokeWidth="1" strokeDasharray="2,1" />
      <path d="M0,48 Q45,60 78,38" fill="none" stroke="#222" strokeWidth="1" strokeDasharray="2,1" />
      <path d="M5,36 Q45,43 85,36 L85,38 Q45,45 5,38Z" fill="#111" opacity="0.5" />
      <path d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z" fill="#333" stroke="#111" strokeWidth="2" />
      <g stroke="#111" strokeWidth="1" opacity="0.3" fill="none">
        <path d="M45,0 L45,25" />
        <path d="M45,0 C25,5 5,15 5,25" />
        <path d="M45,0 C65,5 85,15 85,25" />
      </g>
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#ffffff" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#111" />
    </g>
  )
}

function BlackTuckD() {
  return (
    <g transform="translate(35, 30)">
      <path d="M5,35 C5,40 -8,45 -15,60 C0,80 50,80 85,35 Q45,50 5,35Z" fill="#333" stroke="#111" strokeWidth="2" />
      <path d="M5,36 Q45,43 85,36 L85,38 Q45,45 5,38Z" fill="#111" opacity="0.5" />
      <path d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z" fill="#333" stroke="#111" strokeWidth="2" />
      <g stroke="#111" strokeWidth="1" opacity="0.3" fill="none">
        <path d="M45,0 L45,25" />
        <path d="M45,0 C25,5 5,15 5,25" />
        <path d="M45,0 C65,5 85,15 85,25" />
      </g>
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#ffffff" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#111" />
    </g>
  )
}

/* ═══════════════════════════════════════════
   TWO-TONE POINT — extended right-side taper
   ═══════════════════════════════════════════ */

function TwoTonePointA() {
  return (
    <g transform="translate(35, 30)">
      <path d="M5,35 C5,35 -10,45 -15,55 C-20,65 10,65 40,65 C55,65 66,58 70,45 Q37,42 5,35Z" fill="#d32f2f" stroke="#b71c1c" strokeWidth="2" />
      <path d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z" fill="#f5f5f5" stroke="#ccc" strokeWidth="2" />
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#d32f2f" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#b71c1c" />
    </g>
  )
}

function TwoTonePointB() {
  return (
    <g transform="translate(35, 30)">
      <path d="M5,35 C5,35 -10,45 -15,55 C-20,65 10,65 40,65 C58,65 72,62 75,45 Q40,42 5,35Z" fill="#d32f2f" stroke="#b71c1c" strokeWidth="2" />
      <path d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z" fill="#f5f5f5" stroke="#ccc" strokeWidth="2" />
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#d32f2f" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#b71c1c" />
    </g>
  )
}

function TwoTonePointC() {
  return (
    <g transform="translate(35, 30)">
      <path d="M5,35 C5,35 -10,45 -15,55 C-20,65 10,65 40,65 C55,65 66,58 70,45 Q37,42 5,35Z" fill="#d32f2f" stroke="#b71c1c" strokeWidth="2" />
      <path d="M-5,56 Q35,62 64,50" fill="none" stroke="#b71c1c" strokeWidth="1" opacity="0.6" />
      <path d="M0,48 Q35,54 60,45" fill="none" stroke="#b71c1c" strokeWidth="1" opacity="0.6" />
      <path d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z" fill="#f5f5f5" stroke="#ccc" strokeWidth="2" />
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#d32f2f" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#b71c1c" />
    </g>
  )
}

function TwoTonePointD() {
  return (
    <g transform="translate(35, 30)">
      <path d="M5,35 C5,35 -10,45 -15,55 C-20,68 10,68 40,68 C58,68 68,60 72,45 Q38,42 5,35Z" fill="#d32f2f" stroke="#b71c1c" strokeWidth="2" />
      <path d="M5,25 C5,10 20,0 45,0 C70,0 85,10 85,25 L85,35 C85,40 75,45 45,45 C15,45 5,40 5,35Z" fill="#f5f5f5" stroke="#ccc" strokeWidth="2" />
      <text x="45" y="30" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="12" fill="#d32f2f" textAnchor="middle">MANA</text>
      <circle cx="45" cy="2" r="4" fill="#b71c1c" />
    </g>
  )
}
