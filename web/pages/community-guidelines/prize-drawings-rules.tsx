import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { GiftIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import Link from 'next/link'

export default function CommunityGuidelinesPrizeDrawingsPage() {
  return (
    <Page trackPageView="community guidelines prize drawings page" className="!col-span-7">
      <SEO title="Community Guidelines — Prize Drawing Rules" description="Official rules for Manifold Prize Drawings." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-primary-500">
          <GiftIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Prize Drawing Rules</h1>
        </div>

        <p className="mt-3 text-lg text-ink-600">
          Official rules governing <Link href="/prize" className="text-primary-500 underline">Manifold Prize Drawings</Link>, operated by Manifold Markets, Inc.
        </p>

        <GuidelinesSearch />

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="sponsor" className="text-xl font-semibold text-ink-1000">Sponsor</h2>
          <p className="mt-3 text-ink-700">Manifold Markets, Inc., 425 Divisadero St, San Francisco, CA 94117.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="eligibility" className="text-xl font-semibold text-ink-1000">Eligibility</h2>
          <p className="mt-3 text-ink-700">To participate you must:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>Be at least 18 years old and the age of majority in your jurisdiction</li>
            <li>Have a valid Manifold account in good standing</li>
            <li>Not be a resident of a restricted territory (certain U.S. states, Canadian provinces, and countries — see full rules for details)</li>
            <li>Not be an employee or family member of Manifold, or previously banned from the platform</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="entry-methods" className="text-xl font-semibold text-ink-1000">Entry methods</h2>
          <p className="mt-3 text-ink-700">There are two ways to earn entries:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li><strong>Free entry</strong> — available to all eligible participants at no cost</li>
            <li><strong>Earned entries</strong> — accumulated through Mana earned via predictions and bonuses</li>
          </ul>
          <p className="mt-3 text-ink-700">All eligible entries, whether obtained through the free entry method or through earned entries, will have an equal chance of being selected as a winner.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="prizes" className="text-xl font-semibold text-ink-1000">Prizes</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Winners receive USDC (a stablecoin) sent to their cryptocurrency wallet</li>
            <li>Winners are responsible for providing a valid wallet address, any blockchain fees, and tax compliance</li>
            <li>Prizes are awarded "AS IS" without warranties</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="winner-requirements" className="text-xl font-semibold text-ink-1000">Winner requirements</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Winners must provide a valid wallet address within 5 calendar days of notification</li>
            <li>Identity verification and tax documentation may be required</li>
            <li>Failure to comply results in forfeiture of the prize</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="prohibited-conduct" className="text-xl font-semibold text-ink-1000">Prohibited conduct</h2>
          <p className="mt-3 text-ink-700">The following will result in disqualification:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>Multiple accounts or bonus harvesting</li>
            <li>Bots or automated entry methods</li>
            <li>Market manipulation or collusion</li>
            <li>Providing false information</li>
            <li>Using a VPN to circumvent geographic restrictions</li>
            <li>Any violation of Manifold's Terms of Service</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="liability" className="text-xl font-semibold text-ink-1000">Liability</h2>
          <p className="mt-3 text-ink-700">Manifold's liability is limited to the prize value or $100, whichever is less. Disputes are resolved through binding arbitration in San Francisco. See the full rules for complete terms.</p>
        </div>
      </Col>
    </Page>
  )
}
