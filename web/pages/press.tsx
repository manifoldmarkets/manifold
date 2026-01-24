import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import { Row } from 'web/components/layout/row'
import { LogoIcon } from 'web/components/icons/logo-icon'
import { BadgeCheckIcon, ShieldCheckIcon } from '@heroicons/react/outline'
import { BsFillArrowThroughHeartFill } from 'react-icons/bs'
import { LuCrown, LuSprout } from 'react-icons/lu'
import { GiBurningSkull, GiOpenChest, GiTwoCoins } from 'react-icons/gi'
import { HiOutlineBuildingLibrary } from 'react-icons/hi2'
import ScalesIcon from 'web/lib/icons/scales-icon.svg'
import Foldy from 'web/public/logo.svg'
import { useState } from 'react'

type BadgeInfo = {
  title: string
  description: string
  icon: React.ReactNode
  largeIcon: React.ReactNode
  iconDesc: string
  color: string
}

export default function PressPage() {
  const [selectedBadge, setSelectedBadge] = useState<BadgeInfo | null>(null)

  const badges: BadgeInfo[] = [
    {
      title: 'Core Team',
      description: 'Manifold team members',
      icon: (
        <Foldy
          className="h-5 w-5 stroke-indigo-700 dark:stroke-indigo-300"
          strokeWidth="0.6"
        />
      ),
      largeIcon: (
        <Foldy
          className="h-32 w-32 stroke-indigo-700 dark:stroke-indigo-300"
          strokeWidth="0.6"
        />
      ),
      iconDesc: 'Rotating Foldy logo (logo.svg)',
      color: 'Indigo-700',
    },
    {
      title: 'Moderator',
      description: 'Community moderators',
      icon: (
        <ShieldCheckIcon className="h-5 w-5 text-purple-700 dark:text-purple-400" />
      ),
      largeIcon: (
        <ShieldCheckIcon className="h-32 w-32 text-purple-700 dark:text-purple-400" />
      ),
      iconDesc: 'ShieldCheckIcon (Heroicons)',
      color: 'Purple-700',
    },
    {
      title: 'MVP',
      description: 'Most Valuable Players',
      icon: (
        <BsFillArrowThroughHeartFill className="h-5 w-5 text-purple-700 dark:text-purple-400" />
      ),
      largeIcon: (
        <BsFillArrowThroughHeartFill className="h-32 w-32 text-purple-700 dark:text-purple-400" />
      ),
      iconDesc: 'BsFillArrowThroughHeartFill',
      color: 'Purple-700',
    },
    {
      title: 'Verified',
      description: 'Verified users',
      icon: <BadgeCheckIcon className="text-primary-700 h-5 w-5" />,
      largeIcon: <BadgeCheckIcon className="text-primary-700 h-32 w-32" />,
      iconDesc: 'BadgeCheckIcon (Heroicons)',
      color: 'Primary-700',
    },
    {
      title: 'Partner',
      description: 'Official partners',
      icon: <LuCrown className="text-primary-700 h-5 w-5" />,
      largeIcon: <LuCrown className="text-primary-700 h-32 w-32" />,
      iconDesc: 'LuCrown (Lucide)',
      color: 'Primary-700',
    },
    {
      title: 'Institutional Partner',
      description: 'Institutional partners',
      icon: <HiOutlineBuildingLibrary className="text-primary-700 h-5 w-5" />,
      largeIcon: (
        <HiOutlineBuildingLibrary className="text-primary-700 h-32 w-32" />
      ),
      iconDesc: 'HiOutlineBuildingLibrary',
      color: 'Primary-700',
    },
    {
      title: 'Fresh',
      description: 'New users (< 14 days)',
      icon: <LuSprout className="h-5 w-5 text-green-500" />,
      largeIcon: <LuSprout className="h-32 w-32 text-green-500" />,
      iconDesc: 'LuSprout (Lucide)',
      color: 'Green-500',
    },
    {
      title: 'Question Creator',
      description: 'Market creator badge',
      icon: <ScalesIcon className="h-5 w-5 text-amber-400" />,
      largeIcon: <ScalesIcon className="h-32 w-32 text-amber-400" />,
      iconDesc: 'scales-icon.svg',
      color: 'Amber-400',
    },
    {
      title: 'Bot',
      description: 'Bot accounts',
      icon: (
        <span className="bg-ink-100 text-ink-800 rounded-full px-2 py-0.5 text-xs font-medium">
          Bot
        </span>
      ),
      largeIcon: (
        <span className="bg-ink-100 text-ink-800 rounded-full px-12 py-6 text-6xl font-medium">
          Bot
        </span>
      ),
      iconDesc: 'Text badge: "Bot"',
      color: 'Gray-100 bg',
    },
  ]

  return (
    <Page trackPageView={'press page'} className="!col-span-7">
      <SEO
        title="Press Kit"
        description="Download Manifold Markets brand assets, logos, fonts, and marketing materials for press and media use."
        url="/press"
      />

      <Col className="p-4 pb-12">
        <Title className="mb-2">Press Kit</Title>
        <p className="text-ink-600 mb-4 text-lg">
          Brand assets and marketing materials for Manifold Markets
        </p>
        <div className="bg-primary-100 border-primary-300 text-primary-800 mb-6 rounded-lg border p-4">
          <p className="text-sm">
            <strong>Note:</strong> This page is optimized for light mode viewing
            and screenshot capture.
          </p>
        </div>

        {/* MANIFOLD Brand Wordmark */}
        <div className="bg-canvas-0 mb-8 flex flex-col gap-6 rounded-lg border p-8">
          <div className="flex flex-col gap-4">
            <h3 className="text-ink-800 text-lg font-semibold">
              Primary Wordmark
            </h3>
            <div className="flex items-center justify-center gap-1 py-12 md:gap-2">
              <LogoIcon
                className="h-12 w-12 stroke-indigo-700 md:h-24 md:w-24"
                strokeWidth="0.6"
              />
              <div className="text-3xl font-thin text-indigo-700 md:text-6xl">
                MANIFOLD
              </div>
            </div>
            <p className="text-ink-500 text-center text-sm">
              Reference size - Logo: h-10 w-10, Text: text-xl font-thin, Gap:
              gap-0.5
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-ink-800 text-lg font-semibold">
              White Wordmark (for dark backgrounds)
            </h3>
            <div className="flex items-center justify-center gap-1 bg-black py-12 md:gap-2">
              <LogoIcon
                className="h-12 w-12 stroke-white md:h-24 md:w-24"
                strokeWidth="0.6"
              />
              <div className="text-3xl font-thin text-white md:text-6xl">
                MANIFOLD
              </div>
            </div>
            <p className="text-ink-500 text-center text-sm">
              Same proportions on dark background
            </p>
          </div>
        </div>

        {/* Logos Section */}
        <Section title="Logo Files">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <AssetCard
              title="Logo (SVG)"
              src="/logo.svg"
              downloadPath="/logo.svg"
              bgColor="bg-canvas-0"
            />
            <AssetCard
              title="Logo (PNG)"
              src="/logo.png"
              downloadPath="/logo.png"
              bgColor="bg-canvas-0"
            />
            <AssetCard
              title="Logo White (SVG)"
              src="/logo-white.svg"
              downloadPath="/logo-white.svg"
              bgColor="bg-black"
            />
            <AssetCard
              title="Stylized Crane"
              src="/stylized-crane-black.png"
              downloadPath="/stylized-crane-black.png"
              bgColor="bg-canvas-0"
            />
          </div>
        </Section>

        {/* Fonts Section */}
        <Section title="Typography">
          <div className="bg-canvas-0 rounded-lg border p-6">
            <div className="mb-6">
              <h3 className="text-ink-700 mb-2 text-xl font-bold">
                Primary Typefaces
              </h3>
              <div className="space-y-4">
                <FontExample
                  name="Figtree"
                  sample="The quick brown fox jumps over the lazy dog"
                  fontFamily="font-figtree"
                  downloadPath="/fonts/Figtree-VariableFont_wght.ttf"
                />
                <div className="bg-canvas-50 rounded-lg border p-4">
                  <p className="text-ink-600 text-sm">
                    <strong>Wordmark Usage:</strong> The "MANIFOLD" wordmark
                    uses <strong>Figtree Thin (weight 300)</strong>. For proper
                    sizing, use{' '}
                    <code className="bg-ink-100 rounded px-1">font-thin</code>{' '}
                    and scale proportionally with the logo. Desktop:{' '}
                    <code className="bg-ink-100 rounded px-1">text-6xl</code>{' '}
                    (60px), Mobile:{' '}
                    <code className="bg-ink-100 rounded px-1">text-3xl</code>{' '}
                    (30px). Maintain a{' '}
                    <code className="bg-ink-100 rounded px-1">gap-2</code> (8px)
                    between logo and text on desktop,
                    <code className="bg-ink-100 rounded px-1">gap-1</code> (4px)
                    on mobile.
                  </p>
                </div>
                <FontExample
                  name="Readex Pro"
                  sample="The quick brown fox jumps over the lazy dog"
                  fontFamily="font-sans"
                  downloadPath="/fonts/ReadexPro-Regular.ttf"
                />
                <FontExample
                  name="Major Mono Display"
                  sample="MANIFOLD MARKETS"
                  fontFamily="font-mono"
                  downloadPath="/fonts/MajorMonoDisplay-Regular.ttf"
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Brand Colors Section */}
        <Section title="Brand Colors">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ColorCard
              title="Primary / Indigo"
              hex="#6366f1"
              rgb="rgb(99, 102, 241)"
              colorClass="bg-primary-500"
            />
            <ColorCard
              title="Yes / Teal"
              hex="#14b8a6"
              rgb="rgb(20, 184, 166)"
              colorClass="bg-teal-500"
            />
            <ColorCard
              title="No / Scarlet"
              hex="#f75836"
              rgb="rgb(247, 88, 54)"
              colorClass="bg-scarlet-500"
            />
          </div>
        </Section>

        {/* Currency Assets Section */}
        <Section title="Currency & Icons">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <AssetCard
              title="Mana Symbol"
              src="/mana.svg"
              downloadPath="/mana.svg"
              bgColor="bg-canvas-0"
            />
            <AssetCard
              title="Mana Flat"
              src="/manaFlat.svg"
              downloadPath="/manaFlat.svg"
              bgColor="bg-canvas-0"
            />
            <AssetCard
              title="Manachan"
              src="/manachan.png"
              downloadPath="/manachan.png"
              bgColor="bg-canvas-0"
            />
          </div>
        </Section>

        {/* User Badges Section */}
        <Section title="User Badges & Modifiers">
          <div className="bg-canvas-0 mb-6 rounded-lg border p-6">
            <h3 className="text-ink-800 mb-4 text-lg font-semibold">
              Role Badges
            </h3>
            <p className="text-ink-600 mb-4 text-sm">
              These badges appear next to usernames to indicate special roles or
              status. Icons are from Heroicons, React Icons libraries, and
              custom SVGs.
              <strong>
                {' '}
                Click any badge to display it large for screenshotting.
              </strong>
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {badges.map((badge) => (
                <BadgeExample
                  key={badge.title}
                  badge={badge}
                  onClick={() =>
                    setSelectedBadge(
                      selectedBadge?.title === badge.title ? null : badge
                    )
                  }
                />
              ))}
            </div>

            {/* Large Badge Display */}
            {selectedBadge && (
              <div className="border-primary-500 mt-6 flex flex-col items-center justify-center rounded-lg border-2 bg-white p-12">
                <div className="mb-4 flex items-center justify-center">
                  {selectedBadge.largeIcon}
                </div>
                <h4 className="text-ink-800 mb-2 text-2xl font-bold">
                  {selectedBadge.title}
                </h4>
                <p className="text-ink-600 mb-4 text-center">
                  {selectedBadge.description}
                </p>
                <button
                  onClick={() => setSelectedBadge(null)}
                  className="bg-ink-200 hover:bg-ink-300 rounded px-4 py-2 text-sm font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          <div className="bg-canvas-0 rounded-lg border p-6">
            <h3 className="text-ink-800 mb-4 text-lg font-semibold">
              Achievement Badges
            </h3>
            <p className="text-ink-600 mb-4 text-sm">
              User achievement badges for milestones and accomplishments.
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
              <AssetCard
                title="Account Age"
                src="/achievement-badges/accountAgeYears.png"
                downloadPath="/achievement-badges/accountAgeYears.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Charity Donated"
                src="/achievement-badges/charityDonatedMana.png"
                downloadPath="/achievement-badges/charityDonatedMana.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Creator Traders"
                src="/achievement-badges/creatorTraders.png"
                downloadPath="/achievement-badges/creatorTraders.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Highest Balance"
                src="/achievement-badges/highestBalanceMana.png"
                downloadPath="/achievement-badges/highestBalanceMana.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Total Markets"
                src="/achievement-badges/totalMarketsCreated.png"
                downloadPath="/achievement-badges/totalMarketsCreated.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Total Profit"
                src="/achievement-badges/totalProfitMana.png"
                downloadPath="/achievement-badges/totalProfitMana.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Total Referrals"
                src="/achievement-badges/totalReferrals.png"
                downloadPath="/achievement-badges/totalReferrals.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Total Volume"
                src="/achievement-badges/totalVolumeMana.png"
                downloadPath="/achievement-badges/totalVolumeMana.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Betting Streak"
                src="/achievement-badges/longestBettingStreak.png"
                downloadPath="/achievement-badges/longestBettingStreak.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="League Masters"
                src="/achievement-badges/seasonsMasters.png"
                downloadPath="/achievement-badges/seasonsMasters.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Total Trades"
                src="/achievement-badges/totalTradesCount.png"
                downloadPath="/achievement-badges/totalTradesCount.png"
                bgColor="bg-canvas-0"
                noPadding
              />
              <AssetCard
                title="Comments"
                src="/achievement-badges/numberOfComments.png"
                downloadPath="/achievement-badges/numberOfComments.png"
                bgColor="bg-canvas-0"
                noPadding
              />
            </div>
            <p className="text-ink-500 mt-4 text-xs">
              26 total achievement badges available in{' '}
              <code className="bg-ink-100 rounded px-1">
                /achievement-badges/
              </code>
            </p>
          </div>

          {/* Loan Chest */}
          <div className="bg-canvas-0 rounded-lg border p-6">
            <h3 className="text-ink-800 mb-4 text-lg font-semibold">
              Daily Loan Chest
            </h3>
            <p className="text-ink-600 mb-4 text-sm">
              The loan chest appears in the UI to allow users to collect daily
              loans on their trades.
            </p>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-2">
              {/* Available Loan State */}
              <div className="flex flex-col items-center justify-center rounded-lg border p-8">
                <GiTwoCoins className="mb-3 h-24 w-24 text-yellow-300" />
                <p className="text-ink-800 mb-1 text-center text-sm font-semibold">
                  Available
                </p>
                <p className="text-ink-600 text-center text-xs">
                  Coins icon (yellow-300)
                </p>
                <p className="text-ink-500 mt-2 text-center text-xs">
                  When loan is ready to collect
                </p>
              </div>

              {/* Collected/Empty State */}
              <div className="flex flex-col items-center justify-center rounded-lg border p-8">
                <GiOpenChest className="mb-3 h-24 w-24 text-yellow-900" />
                <p className="text-ink-800 mb-1 text-center text-sm font-semibold">
                  Collected
                </p>
                <p className="text-ink-600 text-center text-xs">
                  Open chest icon (yellow-900)
                </p>
                <p className="text-ink-500 mt-2 text-center text-xs">
                  When already collected or not eligible
                </p>
              </div>
            </div>
            <div className="bg-canvas-50 mt-4 rounded-lg border p-4">
              <p className="text-ink-600 text-sm">
                <strong>Icons:</strong> From{' '}
                <code className="bg-ink-100 rounded px-1">react-icons/gi</code>
              </p>
              <ul className="text-ink-600 mt-2 list-inside list-disc space-y-1 text-sm">
                <li>
                  <code className="bg-ink-100 rounded px-1">GiTwoCoins</code> -
                  Available loan state (text-yellow-300)
                </li>
                <li>
                  <code className="bg-ink-100 rounded px-1">GiOpenChest</code> -
                  Collected/empty state (text-yellow-900)
                </li>
              </ul>
            </div>
          </div>
        </Section>

        {/* Mock Market - Modern Full Page Style */}
        <Section title="Mock Market - Full Page Style (for Screenshots)">
          <div className="bg-canvas-0 rounded-lg border p-6">
            <p className="text-ink-600 mb-4 text-center">
              Create custom market previews for screenshots and promotional
              materials
            </p>
            <p className="text-ink-600 mb-6 text-center text-sm">
              <strong>Tip:</strong> On binary markets, you can drag the points
              on the chart up and down to customize the chart history!
            </p>
            <MockMarket />
          </div>
        </Section>

        {/* Mock Market - Mini Card Style */}
        <Section title="Mock Market - Mini Card Style">
          <div className="bg-canvas-0 rounded-lg border p-6">
            <p className="text-ink-600 mb-6 text-center">
              Compact market card for social media and embedded use
            </p>
            <MiniMockMarket />
          </div>
        </Section>

        {/* Yes/No Button Showcase */}
        <Section title="Yes/No Buttons">
          <YesNoButtonShowcase />
        </Section>

        {/* Usage Guidelines */}
        <Section title="Usage Guidelines">
          <div className="bg-canvas-0 rounded-lg border p-6">
            <div className="text-ink-700 space-y-4">
              <div>
                <h3 className="mb-2 font-semibold">Logo Usage</h3>
                <ul className="text-ink-600 list-inside list-disc space-y-1">
                  <li>Use SVG format when possible for scalability</li>
                  <li>Use white logo on dark backgrounds</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Color Usage</h3>
                <ul className="text-ink-600 list-inside list-disc space-y-1">
                  <li>
                    Teal (Yes) represents affirmative actions and outcomes
                  </li>
                  <li>Scarlet (No) represents negative actions and outcomes</li>
                  <li>
                    Indigo is the primary brand color for general UI elements
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Design Style Conventions</h3>
                <ul className="text-ink-600 list-inside list-disc space-y-1">
                  <li>
                    <strong>Border Radius:</strong> Use{' '}
                    <code className="bg-ink-100 rounded px-1">rounded-md</code>{' '}
                    (0.375rem / 6px) for buttons and most UI elements
                  </li>
                  <li>
                    <strong>Border Radius (Cards):</strong> Use{' '}
                    <code className="bg-ink-100 rounded px-1">rounded-lg</code>{' '}
                    (0.5rem / 8px) for cards and containers
                  </li>
                  <li>
                    <strong>Border Radius (Pills):</strong> Use{' '}
                    <code className="bg-ink-100 rounded px-1">
                      rounded-full
                    </code>{' '}
                    for pill-shaped elements like tags
                  </li>
                  <li>
                    <strong>Button Sizing:</strong> Standard buttons use{' '}
                    <code className="bg-ink-100 rounded px-1">px-6 py-2.5</code>{' '}
                    with{' '}
                    <code className="bg-ink-100 rounded px-1">text-base</code>{' '}
                    (16px) and{' '}
                    <code className="bg-ink-100 rounded px-1">
                      font-semibold
                    </code>
                  </li>
                  <li>
                    <strong>Shadows:</strong> Cards use{' '}
                    <code className="bg-ink-100 rounded px-1">shadow-md</code>{' '}
                    for elevation
                  </li>
                  <li>
                    <strong>Spacing:</strong> Use consistent gap spacing -{' '}
                    <code className="bg-ink-100 rounded px-1">gap-3</code>{' '}
                    (0.75rem) between related elements
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Contact</h3>
                <p className="text-ink-600">
                  For press inquiries and additional assets, please contact:{' '}
                  <a
                    href="mailto:info@manifold.markets"
                    className="text-primary-500 hover:text-primary-600 underline"
                  >
                    info@manifold.markets
                  </a>
                </p>
              </div>
            </div>
          </div>
        </Section>
      </Col>
    </Page>
  )
}

// Helper Components
function YesNoButtonShowcase() {
  const [simpleWidth, setSimpleWidth] = useState(200)
  const [simpleHeight, setSimpleHeight] = useState(70)
  const [arrowWidth, setArrowWidth] = useState(180)
  const [arrowHeight, setArrowHeight] = useState(56)

  const resetSimple = () => {
    setSimpleWidth(200)
    setSimpleHeight(70)
  }

  const resetArrow = () => {
    setArrowWidth(180)
    setArrowHeight(56)
  }

  // Calculate font size based on button height
  const getSimpleFontSize = () => {
    return Math.max(12, Math.min(32, simpleHeight * 0.4))
  }

  const getArrowFontSize = () => {
    return Math.max(12, Math.min(24, arrowHeight * 0.35))
  }

  return (
    <div className="bg-canvas-0 rounded-lg border p-8">
      <div className="flex flex-col items-center gap-8">
        <div className="w-full">
          <p className="text-ink-600 mb-4 text-center">
            Manifold's signature Yes/No button design
          </p>
          <p className="text-ink-500 mb-2 text-center text-xs">
            Drag the edges to resize (both buttons mirror each other)
          </p>
          <div className="mb-4 flex justify-center">
            <button
              onClick={resetSimple}
              className="text-primary-600 hover:text-primary-700 text-xs underline"
            >
              Reset to Default
            </button>
          </div>
          <Row className="justify-center gap-4">
            <div
              className="group relative"
              style={{ width: simpleWidth, height: simpleHeight }}
            >
              <button
                className="h-full w-full rounded-lg bg-teal-500 font-semibold text-white transition-colors hover:bg-teal-600"
                style={{ fontSize: `${getSimpleFontSize()}px` }}
              >
                YES
              </button>
              {/* Right resize handle */}
              <div
                className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const startX = e.clientX
                  const startWidth = simpleWidth
                  const handleMouseMove = (e: MouseEvent) => {
                    const delta = e.clientX - startX
                    setSimpleWidth(Math.max(100, startWidth + delta))
                  }
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove)
                    document.removeEventListener('mouseup', handleMouseUp)
                  }
                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
              >
                <div className="bg-primary-500 h-full w-full rounded"></div>
              </div>
              {/* Bottom resize handle */}
              <div
                className="absolute -bottom-1 left-0 h-2 w-full cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const startY = e.clientY
                  const startHeight = simpleHeight
                  const handleMouseMove = (e: MouseEvent) => {
                    const delta = e.clientY - startY
                    setSimpleHeight(Math.max(40, startHeight + delta))
                  }
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove)
                    document.removeEventListener('mouseup', handleMouseUp)
                  }
                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
              >
                <div className="bg-primary-500 h-full w-full rounded"></div>
              </div>
            </div>
            <div style={{ width: simpleWidth, height: simpleHeight }}>
              <button
                className="bg-scarlet-500 hover:bg-scarlet-600 h-full w-full rounded-lg font-semibold text-white transition-colors"
                style={{ fontSize: `${getSimpleFontSize()}px` }}
              >
                NO
              </button>
            </div>
          </Row>
        </div>

        <div className="border-ink-200 w-full border-t"></div>

        <div className="w-full">
          <p className="text-ink-600 mb-4 text-center">
            With directional arrows (for betting actions)
          </p>
          <p className="text-ink-500 mb-2 text-center text-xs">
            Drag the edges to resize (both buttons mirror each other)
          </p>
          <div className="mb-4 flex justify-center">
            <button
              onClick={resetArrow}
              className="text-primary-600 hover:text-primary-700 text-xs underline"
            >
              Reset to Default
            </button>
          </div>
          <Row className="justify-center gap-4">
            <div
              className="group relative"
              style={{ width: arrowWidth, height: arrowHeight }}
            >
              <button
                className="flex h-full w-full items-center justify-center gap-1 rounded-md bg-teal-500 font-semibold text-white transition-colors hover:bg-teal-600"
                style={{ fontSize: `${getArrowFontSize()}px` }}
              >
                <span>Bet YES</span>
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  style={{
                    width: `${getArrowFontSize() * 0.8}px`,
                    height: `${getArrowFontSize() * 0.8}px`,
                  }}
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {/* Right resize handle */}
              <div
                className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const startX = e.clientX
                  const startWidth = arrowWidth
                  const handleMouseMove = (e: MouseEvent) => {
                    const delta = e.clientX - startX
                    setArrowWidth(Math.max(100, startWidth + delta))
                  }
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove)
                    document.removeEventListener('mouseup', handleMouseUp)
                  }
                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
              >
                <div className="bg-primary-500 h-full w-full rounded"></div>
              </div>
              {/* Bottom resize handle */}
              <div
                className="absolute -bottom-1 left-0 h-2 w-full cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const startY = e.clientY
                  const startHeight = arrowHeight
                  const handleMouseMove = (e: MouseEvent) => {
                    const delta = e.clientY - startY
                    setArrowHeight(Math.max(40, startHeight + delta))
                  }
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove)
                    document.removeEventListener('mouseup', handleMouseUp)
                  }
                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
              >
                <div className="bg-primary-500 h-full w-full rounded"></div>
              </div>
            </div>
            <div style={{ width: arrowWidth, height: arrowHeight }}>
              <button
                className="bg-scarlet-500 hover:bg-scarlet-600 flex h-full w-full items-center justify-center gap-1 rounded-md font-semibold text-white transition-colors"
                style={{ fontSize: `${getArrowFontSize()}px` }}
              >
                <span>Bet NO</span>
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  style={{
                    width: `${getArrowFontSize() * 0.8}px`,
                    height: `${getArrowFontSize() * 0.8}px`,
                  }}
                >
                  <path
                    fillRule="evenodd"
                    d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </Row>
        </div>

        <div className="text-ink-500 space-y-1 text-center text-sm">
          <div>YES: Teal (#14b8a6)</div>
          <div>NO: Scarlet (#f75836)</div>
        </div>
      </div>
    </div>
  )
}

function MockMarket() {
  const [marketType, setMarketType] = useState<'binary' | 'multiple'>(
    'multiple'
  )
  const [question, setQuestion] = useState(
    'Who will win the 2025 MLB World Series MVP?'
  )
  const [probability, setProbability] = useState(52)
  const [creatorName, setCreatorName] = useState('Manifold')
  const [volume, setVolume] = useState('27k')
  const [traders, setTraders] = useState('1.7k')
  const [scale, setScale] = useState(100)

  // Binary market editable fields
  const [likes, setLikes] = useState('1')
  const [date, setDate] = useState('Nov 1')
  const [changeAmount, setChangeAmount] = useState('5')
  const [changeDirection, setChangeDirection] = useState<'up' | 'down'>('down')

  // Chart data points (y values, 0-100 representing probability)
  const [chartPoints, setChartPoints] = useState([
    70, 72, 66, 76, 62, 60, 56, 35, 41, 45, 49, 39, 43, 37, 41, 31, 27, 19, 47,
    51, 59,
  ])
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(
    null
  )

  // Multiple choice answers
  const [answers, setAnswers] = useState([
    { text: 'Shohei Ohtani', prob: 62 },
    { text: 'Freddie Freeman', prob: 12 },
    { text: 'Vladimir Guerrero Jr.', prob: 8 },
    { text: 'Alejandro Kirk', prob: 4 },
  ])

  const cardScale = scale / 100

  // Generate SVG path from chart points
  const generateChartPath = (points: number[], close = false) => {
    if (points.length === 0) return ''

    const width = 800
    const height = 256
    const xStep = width / (points.length - 1)

    const pathCommands = points.map((point, i) => {
      const x = i * xStep
      const y = height - (point / 100) * (height * 0.8) - 20
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
    })

    if (close) {
      pathCommands.push(`L ${width} ${height}`)
      pathCommands.push(`L 0 ${height}`)
      pathCommands.push('Z')
    }

    return pathCommands.join(' ')
  }

  const handleChartMouseDown = (index: number) => {
    setDraggedPointIndex(index)
  }

  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggedPointIndex === null) return

    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const y = e.clientY - rect.top
    const height = rect.height

    // Convert Y position to probability (0-100)
    const newProb = Math.max(
      0,
      Math.min(100, 100 - ((y - 20) / (height * 0.8)) * 100)
    )

    const newPoints = [...chartPoints]
    newPoints[draggedPointIndex] = Math.round(newProb)
    setChartPoints(newPoints)
  }

  const handleChartMouseUp = () => {
    setDraggedPointIndex(null)
  }

  const getAnswerColor = (index: number) => {
    const colors = [
      '#99DDFF', // sky
      '#FFDD99', // sand
      '#FFAABB', // pink
      '#77F299', // light green
      '#CD46EA', // purple
      '#F23542', // blood red
      '#FF8C00', // orange
      '#44BB99', // forest
    ]
    return colors[index % colors.length]
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Market Type Selector */}
      <div className="flex justify-center gap-4">
        <button
          onClick={() => {
            setMarketType('binary')
            setQuestion('Will this be the best press kit ever created?')
            setProbability(52)
            setVolume('42m')
            setTraders('10k')
          }}
          className={`rounded-lg px-6 py-2 font-medium transition-colors ${
            marketType === 'binary'
              ? 'bg-primary-500 text-white'
              : 'bg-canvas-0 text-ink-600 hover:border-primary-300 border'
          }`}
        >
          Binary Market
        </button>
        <button
          onClick={() => {
            setMarketType('multiple')
            setQuestion('Who will win the 2025 MLB World Series MVP?')
            setVolume('27k')
            setTraders('1.7k')
          }}
          className={`rounded-lg px-6 py-2 font-medium transition-colors ${
            marketType === 'multiple'
              ? 'bg-primary-500 text-white'
              : 'bg-canvas-0 text-ink-600 hover:border-primary-300 border'
          }`}
        >
          Multiple Choice
        </button>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="text-ink-700 mb-1 block text-sm font-medium">
            Question
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
          />
        </div>

        {marketType === 'binary' ? (
          <>
            {/* Binary market controls */}
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Probability: {probability}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={probability}
                onChange={(e) => setProbability(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Scale: {scale}%
              </label>
              <input
                type="range"
                min="50"
                max="150"
                value={scale}
                onChange={(e) => setScale(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Volume
              </label>
              <input
                type="text"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Traders
              </label>
              <input
                type="text"
                value={traders}
                onChange={(e) => setTraders(e.target.value)}
                className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Likes
              </label>
              <input
                type="text"
                value={likes}
                onChange={(e) => setLikes(e.target.value)}
                className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Date
              </label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Change Amount
              </label>
              <input
                type="text"
                value={changeAmount}
                onChange={(e) => setChangeAmount(e.target.value)}
                className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Change Direction
              </label>
              <select
                value={changeDirection}
                onChange={(e) =>
                  setChangeDirection(e.target.value as 'up' | 'down')
                }
                className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
              >
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
            </div>
          </>
        ) : (
          <>
            {/* Multiple choice market controls */}
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Volume
              </label>
              <input
                type="text"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Traders
              </label>
              <input
                type="text"
                value={traders}
                onChange={(e) => setTraders(e.target.value)}
                className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
              />
            </div>
            <div>
              <label className="text-ink-700 mb-1 block text-sm font-medium">
                Scale: {scale}%
              </label>
              <input
                type="range"
                min="50"
                max="150"
                value={scale}
                onChange={(e) => setScale(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </>
        )}
      </div>

      {/* Multiple Choice Answer Editor */}
      {marketType === 'multiple' && (
        <div>
          <label className="text-ink-700 mb-2 block text-sm font-medium">
            Answers (edit text and probabilities)
          </label>
          <div className="space-y-2">
            {answers.map((answer, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={answer.text}
                  onChange={(e) => {
                    const newAnswers = [...answers]
                    newAnswers[index].text = e.target.value
                    setAnswers(newAnswers)
                  }}
                  className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                />
                <input
                  type="number"
                  value={answer.prob}
                  onChange={(e) => {
                    const newAnswers = [...answers]
                    newAnswers[index].prob = parseInt(e.target.value) || 0
                    setAnswers(newAnswers)
                  }}
                  className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-20 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                />
                <span className="text-ink-600 text-sm">%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market Preview */}
      <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-8">
        <div
          className="bg-canvas-0 w-full max-w-3xl overflow-hidden rounded-lg border shadow-md transition-all"
          style={{ transform: `scale(${cardScale})` }}
        >
          {/* Header with avatar and question */}
          <div className="flex items-start gap-3 p-6 pb-4">
            <div className="bg-primary-100 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full">
              <LogoIcon
                className="stroke-primary-700 h-8 w-8"
                strokeWidth="0.6"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-ink-600 mb-1 text-sm">Manifold Markets</div>
              <h2 className="text-ink-1000 text-2xl font-semibold leading-tight">
                {question}
              </h2>
            </div>
          </div>

          {marketType === 'binary' ? (
            <>
              {/* Binary Market Layout */}
              <div className="px-4 pb-4">
                {/* Probability with change indicator */}
                <div className="mb-3 flex items-baseline gap-2">
                  <div className="text-ink-900 text-5xl font-bold">
                    {probability}%
                  </div>
                  <div className="text-ink-600 text-base">chance</div>
                  <div
                    className={`ml-1 flex items-center gap-0.5 text-sm ${
                      changeDirection === 'down'
                        ? 'text-scarlet-500'
                        : 'text-teal-500'
                    }`}
                  >
                    {changeDirection === 'down' ? (
                      <svg
                        className="h-3 w-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-3 w-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    <span className="font-medium">{changeAmount}</span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="text-ink-600 mb-4 flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                    <span>{likes}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span>{traders}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                    <span>M{volume}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>{date}</span>
                  </div>
                </div>

                {/* Chart */}
                <div className="relative mb-3">
                  <div className="relative h-64 overflow-hidden rounded-lg bg-teal-50">
                    <svg
                      className="h-full w-full cursor-crosshair"
                      viewBox="0 0 800 256"
                      preserveAspectRatio="none"
                      onMouseMove={handleChartMouseMove}
                      onMouseUp={handleChartMouseUp}
                      onMouseLeave={handleChartMouseUp}
                    >
                      <defs>
                        <linearGradient
                          id="chartGradient"
                          x1="0"
                          x2="0"
                          y1="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#14b8a6"
                            stopOpacity="0.2"
                          />
                          <stop
                            offset="100%"
                            stopColor="#14b8a6"
                            stopOpacity="0.05"
                          />
                        </linearGradient>
                      </defs>

                      {/* Fill area */}
                      <path
                        d={generateChartPath(chartPoints, true)}
                        fill="url(#chartGradient)"
                      />

                      {/* Line */}
                      <path
                        d={generateChartPath(chartPoints, false)}
                        stroke="#14b8a6"
                        strokeWidth="2.5"
                        fill="none"
                      />

                      {/* Draggable points */}
                      {chartPoints.map((point, index) => {
                        const xStep = 800 / (chartPoints.length - 1)
                        const x = index * xStep
                        const y = 256 - (point / 100) * (256 * 0.8) - 20

                        return (
                          <circle
                            key={index}
                            cx={x}
                            cy={y}
                            r="6"
                            fill="#14b8a6"
                            stroke="white"
                            strokeWidth="2"
                            className="cursor-grab active:cursor-grabbing"
                            onMouseDown={() => handleChartMouseDown(index)}
                            style={{
                              cursor:
                                draggedPointIndex === index
                                  ? 'grabbing'
                                  : 'grab',
                            }}
                          />
                        )
                      })}
                    </svg>

                    {/* Manifold watermark */}
                    <div className="pointer-events-none absolute bottom-2 left-3 flex items-center gap-1.5 opacity-40">
                      <LogoIcon
                        className="stroke-ink-600 h-4 w-4"
                        strokeWidth="0.6"
                      />
                      <span className="text-ink-600 text-xs">MANIFOLD</span>
                    </div>

                    {/* Time period buttons */}
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-white/80 px-2 py-1 text-xs font-medium backdrop-blur-sm">
                      <button className="text-ink-500 hover:text-ink-800 px-1.5 py-0.5">
                        1H
                      </button>
                      <button className="text-ink-500 hover:text-ink-800 px-1.5 py-0.5">
                        6H
                      </button>
                      <button className="text-ink-500 hover:text-ink-800 px-1.5 py-0.5">
                        1D
                      </button>
                      <button className="text-ink-500 hover:text-ink-800 px-1.5 py-0.5">
                        1W
                      </button>
                      <button className="text-ink-500 hover:text-ink-800 px-1.5 py-0.5">
                        1M
                      </button>
                      <button className="rounded bg-teal-500 px-1.5 py-0.5 text-white">
                        ALL
                      </button>
                    </div>

                    {/* 100% label */}
                    <div className="text-ink-600 pointer-events-none absolute right-2 top-10 text-xs font-medium">
                      100%
                    </div>

                    {/* 0% label */}
                    <div className="text-ink-600 pointer-events-none absolute bottom-2 right-2 text-xs font-medium">
                      0%
                    </div>
                  </div>
                </div>

                {/* Time labels */}
                <div className="text-ink-500 mb-4 flex justify-between px-1 text-xs">
                  <span>Oct 05</span>
                  <span>Oct 12</span>
                  <span>Oct 19</span>
                  <span>Oct 26</span>
                </div>
              </div>

              {/* Bet Buttons */}
              <div className="flex gap-3 px-4 pb-4">
                <button className="flex flex-1 items-center justify-center gap-1 rounded-md bg-teal-500 px-6 py-2.5 text-base font-semibold text-white transition-colors hover:bg-teal-600">
                  <span>Bet YES</span>
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <button className="bg-scarlet-500 hover:bg-scarlet-600 flex flex-1 items-center justify-center gap-1 rounded-md px-6 py-2.5 text-base font-semibold text-white transition-colors">
                  <span>Bet NO</span>
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Multiple Choice Market: Answer Bars */}
              <div className="space-y-3 px-6 pb-4">
                {answers.map((answer, index) => (
                  <div
                    key={index}
                    className="border-ink-200 bg-canvas-0 hover:border-primary-300 relative flex items-center overflow-hidden rounded-lg border transition-all hover:shadow-sm"
                  >
                    {/* Color fill bar behind everything */}
                    <div
                      className="absolute inset-y-0 left-0 transition-all"
                      style={{
                        width: `${answer.prob}%`,
                        backgroundColor: getAnswerColor(index),
                      }}
                    />

                    {/* Content on top of color bar */}
                    <div className="relative z-10 flex w-full items-center">
                      {/* Percentage on the left */}
                      <div className="flex w-20 flex-shrink-0 items-center justify-center py-3">
                        <span className="text-ink-1000 text-2xl font-bold">
                          {answer.prob}%
                        </span>
                      </div>

                      {/* Answer text */}
                      <div className="flex flex-1 items-center py-3">
                        <span className="text-ink-900 text-base font-medium">
                          {answer.text}
                        </span>
                      </div>

                      {/* Bet buttons on the right */}
                      <div className="flex items-center gap-2 px-3 py-3">
                        <button className="hover:text-ink-0 rounded-md border border-current px-3 py-1.5 text-xs font-semibold text-teal-500 transition-colors hover:bg-teal-500">
                          Yes
                        </button>
                        <button className="text-scarlet-500 hover:bg-scarlet-500 hover:text-ink-0 rounded-md border border-current px-3 py-1.5 text-xs font-semibold transition-colors">
                          No
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stats */}
              <div className="border-ink-200 flex items-center gap-6 border-t px-6 py-4">
                <div className="text-ink-600 flex items-center gap-1.5 text-sm">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                  <span className="font-medium">M${volume}</span>
                </div>
                <div className="text-ink-600 flex items-center gap-1.5 text-sm">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  <span>{traders}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-ink-500 text-center text-sm">
        Switch between market types and adjust the controls, then screenshot the
        preview
      </p>
    </div>
  )
}

function MiniMockMarket() {
  const [question, setQuestion] = useState(
    'Will this be the best press kit ever created?'
  )
  const [probability, setProbability] = useState(87)
  const [creatorName, setCreatorName] = useState('Manifold')
  const [volume, setVolume] = useState('1,234')
  const [traders, setTraders] = useState('56')
  const [scale, setScale] = useState(100)

  const cardScale = scale / 100

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-ink-700 mb-1 block text-sm font-medium">
            Question
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
          />
        </div>
        <div>
          <label className="text-ink-700 mb-1 block text-sm font-medium">
            Creator Name
          </label>
          <input
            type="text"
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
          />
        </div>
        <div>
          <label className="text-ink-700 mb-1 block text-sm font-medium">
            Probability: {probability}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={probability}
            onChange={(e) => setProbability(parseInt(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-ink-700 mb-1 block text-sm font-medium">
            Scale: {scale}%
          </label>
          <input
            type="range"
            min="50"
            max="150"
            value={scale}
            onChange={(e) => setScale(parseInt(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="text-ink-700 mb-1 block text-sm font-medium">
            Volume (M$)
          </label>
          <input
            type="text"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
          />
        </div>
        <div>
          <label className="text-ink-700 mb-1 block text-sm font-medium">
            Traders
          </label>
          <input
            type="text"
            value={traders}
            onChange={(e) => setTraders(e.target.value)}
            className="border-ink-300 bg-canvas-0 text-ink-1000 focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-1"
          />
        </div>
      </div>

      {/* Market Card Preview */}
      <div className="bg-canvas-50 flex items-center justify-center rounded-lg p-8">
        <div
          className="bg-canvas-0 w-full max-w-2xl overflow-hidden rounded-lg border shadow-md transition-all"
          style={{ transform: `scale(${cardScale})` }}
        >
          {/* Market Header */}
          <div className="flex items-start gap-3 p-4">
            <div className="bg-primary-100 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
              <LogoIcon
                className="stroke-primary-700 h-6 w-6"
                strokeWidth="0.6"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-ink-700 mb-1 text-sm font-medium">
                {creatorName}
              </div>
              <h3 className="text-ink-900 break-words text-lg font-semibold leading-tight">
                {question}
              </h3>
            </div>
          </div>

          {/* Probability Display */}
          <div className="px-4 pb-3">
            <div className="relative h-16 overflow-hidden rounded-lg">
              <div
                className="absolute inset-y-0 left-0 flex items-center justify-start bg-teal-500 px-4 transition-all"
                style={{ width: `${probability}%` }}
              >
                <span className="text-lg font-bold text-white">
                  {probability}%
                </span>
              </div>
              <div
                className="bg-scarlet-500 absolute inset-y-0 right-0 flex items-center justify-end px-4 transition-all"
                style={{ width: `${100 - probability}%` }}
              >
                <span className="text-lg font-bold text-white">
                  {100 - probability}%
                </span>
              </div>
            </div>
          </div>

          {/* Market Stats */}
          <div className="border-ink-200 flex items-center justify-between border-t px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="text-ink-600 flex items-center gap-1 text-sm">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
                <span className="font-medium">M${volume}</span>
              </div>
              <div className="text-ink-600 flex items-center gap-1 text-sm">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <span>{traders}</span>
              </div>
            </div>
            <Row className="gap-2">
              <button className="rounded bg-teal-500 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-teal-600">
                YES
              </button>
              <button className="bg-scarlet-500 hover:bg-scarlet-600 rounded px-4 py-1.5 text-sm font-semibold text-white transition-colors">
                NO
              </button>
            </Row>
          </div>
        </div>
      </div>

      <p className="text-ink-500 text-center text-sm">
        Adjust the controls above, then take a screenshot of the preview card
      </p>
    </div>
  )
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-12">
      <h2 className="text-ink-800 mb-4 text-2xl font-bold">{props.title}</h2>
      {props.children}
    </div>
  )
}

function AssetCard(props: {
  title: string
  src: string
  downloadPath: string
  bgColor: string
  noPadding?: boolean
}) {
  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = props.downloadPath
    link.download = props.downloadPath.split('/').pop() || 'download'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Make white logos bigger on dark backgrounds, and determine padding
  const isWhiteLogo = props.title.includes('White')
  const isCurrencyIcon =
    props.title.includes('Mana') || props.title.includes('Manachan')
  const imageScale = isWhiteLogo ? 'w-full h-full' : 'max-h-full max-w-full'

  // Determine padding: no padding if noPadding prop is true, or if it's a currency icon
  const padding = props.noPadding || isCurrencyIcon ? 'p-0' : 'p-8'

  return (
    <div className="bg-canvas-0 group relative flex flex-col overflow-hidden rounded-lg border transition-shadow hover:shadow-md">
      <div
        className={`flex aspect-square items-center justify-center ${padding} ${props.bgColor}`}
      >
        <img
          src={props.src}
          alt={props.title}
          className={`${imageScale} object-contain`}
        />
      </div>
      <div className="border-ink-200 border-t p-3">
        <p className="text-ink-700 mb-2 text-sm font-medium">{props.title}</p>
        <button
          onClick={handleDownload}
          className="bg-primary-500 hover:bg-primary-600 w-full rounded px-3 py-1.5 text-xs font-medium text-white transition-colors"
        >
          Download
        </button>
      </div>
    </div>
  )
}

function ColorCard(props: {
  title: string
  hex: string
  rgb: string
  colorClass: string
}) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="bg-canvas-0 overflow-hidden rounded-lg border">
      <div className={`h-32 ${props.colorClass}`}></div>
      <div className="p-4">
        <h3 className="text-ink-800 mb-2 font-semibold">{props.title}</h3>
        <button
          onClick={() => copyToClipboard(props.hex)}
          className="text-ink-600 hover:text-ink-800 mb-1 block cursor-pointer text-sm transition-colors"
          title="Click to copy"
        >
          {props.hex}
        </button>
        <button
          onClick={() => copyToClipboard(props.rgb)}
          className="text-ink-500 hover:text-ink-700 block cursor-pointer text-xs transition-colors"
          title="Click to copy"
        >
          {props.rgb}
        </button>
      </div>
    </div>
  )
}

function FontExample(props: {
  name: string
  sample: string
  fontFamily: string
  downloadPath: string
}) {
  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = props.downloadPath
    link.download = props.downloadPath.split('/').pop() || 'font.ttf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="border-ink-200 rounded-lg border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-ink-800 font-semibold">{props.name}</h4>
        <button
          onClick={handleDownload}
          className="bg-primary-500 hover:bg-primary-600 rounded px-3 py-1 text-xs font-medium text-white transition-colors"
        >
          Download
        </button>
      </div>
      <p className={`text-ink-700 text-2xl ${props.fontFamily}`}>
        {props.sample}
      </p>
    </div>
  )
}

function BadgeExample(props: { badge: BadgeInfo; onClick: () => void }) {
  const { badge, onClick } = props
  return (
    <button
      onClick={onClick}
      className="border-ink-200 hover:border-primary-500 cursor-pointer rounded-lg border p-4 text-left transition-all hover:shadow-md"
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center">
          {badge.icon}
        </div>
        <h4 className="text-ink-800 font-semibold">{badge.title}</h4>
      </div>
      <p className="text-ink-600 mb-2 text-sm">{badge.description}</p>
      <div className="text-ink-500 space-y-1 text-xs">
        <div>
          <strong>Icon:</strong> {badge.iconDesc}
        </div>
        <div>
          <strong>Color:</strong> {badge.color}
        </div>
      </div>
    </button>
  )
}
