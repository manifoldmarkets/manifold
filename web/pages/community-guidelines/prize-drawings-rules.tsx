import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, GiftIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import Link from 'next/link'

export default function CommunityGuidelinesPrizeDrawingsPage() {
  return (
    <Page
      trackPageView="community guidelines prize drawings page"
      className="!col-span-7"
    >
      <SEO
        title="Community Guidelines — Prize Drawing Rules"
        description="Official rules for Manifold Prize Drawings."
      />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/community-guidelines"
          className="text-ink-500 hover:text-primary-500 mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="text-primary-500 flex items-center gap-2">
          <GiftIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Prize Drawing Rules</h1>
        </div>

        <p className="text-ink-600 mt-3 text-lg">
          Official rules governing{' '}
          <Link href="/prize" className="text-primary-500 underline">
            Manifold Prize Drawings
          </Link>
          , operated by Manifold Markets, Inc.
        </p>

        <GuidelinesSearch />

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="sponsor" className="text-ink-1000 text-xl font-semibold">
            Sponsor
          </h2>
          <p className="text-ink-700 mt-3">
            Manifold Markets, Inc., 425 Divisadero St, San Francisco, CA 94117.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="eligibility" className="text-ink-1000 text-xl font-semibold">
            Eligibility
          </h2>
          <p className="text-ink-700 mt-3">To participate you must:</p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>
              Be at least 18 years old and the age of majority in your
              jurisdiction
            </li>
            <li>Have a valid Manifold account in good standing</li>
            <li>
              Not be a resident of a restricted territory (certain U.S. states,
              Canadian provinces, and countries — see the{' '}
              <a
                href="https://docs.manifold.markets/prize-rules"
                target="_blank"
                rel="noreferrer"
                className="text-primary-500 underline"
              >
                official rules
              </a>{' '}
              for the complete list)
            </li>
            <li>
              Not be an employee or family member of Manifold, or previously
              banned from the platform
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="entry-methods"
            className="text-ink-1000 text-xl font-semibold"
          >
            Entry methods
          </h2>
          <p className="text-ink-700 mt-3">
            There are two ways to earn entries:
          </p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Free entry</strong> — available to all eligible
              participants at no cost
            </li>
            <li>
              <strong>Earned entries</strong> — accumulated through Mana earned
              via predictions and bonuses
            </li>
          </ul>
          <p className="text-ink-700 mt-3">
            All eligible entries, whether obtained through the free entry method
            or through earned entries, will have an equal chance of being
            selected as a winner.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="prizes" className="text-ink-1000 text-xl font-semibold">
            Prizes
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Winners receive USDC (a stablecoin) sent to their cryptocurrency
              wallet
            </li>
            <li>
              Winners are responsible for providing a valid wallet address, any
              blockchain fees, and tax compliance
            </li>
            <li>Prizes are awarded "AS IS" without warranties</li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="winner-requirements"
            className="text-ink-1000 text-xl font-semibold"
          >
            Winner requirements
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Winners must provide a valid wallet address within 5 calendar days
              of notification
            </li>
            <li>Identity verification and tax documentation may be required</li>
            <li>Failure to comply results in forfeiture of the prize</li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="prohibited-conduct"
            className="text-ink-1000 text-xl font-semibold"
          >
            Prohibited conduct
          </h2>
          <p className="text-ink-700 mt-3">
            The following will result in disqualification:
          </p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>Multiple accounts or bonus harvesting</li>
            <li>Bots or automated entry methods</li>
            <li>Market manipulation or collusion</li>
            <li>Providing false information</li>
            <li>Using a VPN to circumvent geographic restrictions</li>
            <li>Any violation of Manifold's Terms of Service</li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="liability" className="text-ink-1000 text-xl font-semibold">
            Liability
          </h2>
          <p className="text-ink-700 mt-3">
            Manifold's liability is limited to the prize value or $100,
            whichever is less. Disputes are resolved through binding arbitration
            in San Francisco. See the full rules for complete terms.
          </p>
        </div>
      </Col>
    </Page>
  )
}
