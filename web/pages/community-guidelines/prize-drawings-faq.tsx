import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, GiftIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import { SectionNav } from 'web/components/guidelines-sections'
import Link from 'next/link'

export default function CommunityGuidelinesPrizeDrawingsFAQPage() {
  return (
    <Page
      trackPageView="community guidelines prize drawings faq page"
      className="!col-span-7"
    >
      <SEO
        title="Community Guidelines — Prize Drawing FAQ"
        description="Frequently asked questions about Manifold Prize Drawings."
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
          <h1 className="text-4xl font-bold">Prize Drawing FAQ</h1>
        </div>

        <p className="text-ink-600 mt-3 text-lg">
          Manifold runs periodic prize drawings where you can win real money
          (paid in USDC) just by being an active predictor on the platform.
        </p>

        <GuidelinesSearch />

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="how-to-enter" className="text-ink-1000 text-xl font-semibold">
            How do I enter?
          </h2>
          <p className="text-ink-700 mt-3">
            The drawing is entirely opt-in. Users with at least 1,000 mana
            invested across markets can claim one free entry on the{' '}
            <Link href="/prize" className="text-primary-500 underline">
              Prize Drawing
            </Link>{' '}
            page. Additional entries can be purchased by converting mana.
          </p>
          <p className="text-ink-700 mt-3">
            Entry pricing uses a bonding curve — earlier entries cost less mana,
            with prices scaling gradually as more entries are purchased.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="eligibility" className="text-ink-1000 text-xl font-semibold">
            Who can enter?
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>Must be 18 or older</li>
            <li>Must have at least 1,000 mana invested across markets</li>
            <li>Only one account per person</li>
            <li>
              Must be in an eligible location — many countries and US states are
              restricted (see below)
            </li>
            <li>Cannot be a Manifold employee or immediate family member</li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="restricted-locations"
            className="text-ink-1000 text-xl font-semibold"
          >
            Restricted locations
          </h2>
          <p className="text-ink-700 mt-3">
            Several US states, Ontario (Canada), and a number of countries
            including Australia, Germany, the Netherlands, Russia, and others
            are not eligible to participate. See the{' '}
            <a
              href="https://docs.manifold.markets/prize-rules"
              target="_blank"
              rel="noreferrer"
              className="text-primary-500 underline"
            >
              Official Rules
            </a>{' '}
            for the complete list.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="prizes" className="text-ink-1000 text-xl font-semibold">
            What are the prizes?
          </h2>
          <p className="text-ink-700 mt-3">
            Prizes are paid in USDC, a stablecoin pegged to the US dollar. In
            drawings with multiple prizes, each person can only win one.
          </p>
          <p className="text-ink-700 mt-3">
            Winners have 5 calendar days to reply with a crypto wallet address.
            If no address is provided within the claim period, Manifold may
            forfeit the prize and either select an alternate winner or donate
            the amount to charity.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="wallets" className="text-ink-1000 text-xl font-semibold">
            Do I need a crypto wallet?
          </h2>
          <p className="text-ink-700 mt-3">
            Yes — you'll need a wallet that supports receiving USDC. MetaMask
            and Trust Wallet are commonly used options.
          </p>
          <p className="text-ink-700 mt-3 font-medium">
            Manifold will never ask for your private key, seed phrase, or
            recovery phrase. Anyone asking for these is not Manifold.
          </p>
          <p className="text-ink-700 mt-3">
            Manifold has not issued any cryptocurrency token — any promotion of
            such is fraudulent.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="winner-selection"
            className="text-ink-1000 text-xl font-semibold"
          >
            How are winners selected?
          </h2>
          <p className="text-ink-700 mt-3">
            Winners are selected through a provably fair process seeded by the
            Bitcoin blockchain, using SHA-256 hashing of Bitcoin block data for
            transparency. All entries have an equal probability of winning,
            whether free or purchased.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="taxes" className="text-ink-1000 text-xl font-semibold">
            What about taxes?
          </h2>
          <p className="text-ink-700 mt-3">
            Prizes are treated as taxable income in many locations. Consult a
            tax professional about your obligations.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="disqualification"
            className="text-ink-1000 text-xl font-semibold"
          >
            What can get me disqualified?
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>Bonus harvesting or using multiple accounts</li>
            <li>Misresolving markets</li>
            <li>Using bots or automated tools</li>
            <li>Using a VPN to spoof your location</li>
            <li>Providing false information</li>
            <li>Any other suspicious activity or Terms of Service violation</li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-50 mt-8 rounded-xl border-2 p-5">
          <p className="text-ink-700 text-sm">
            For the complete legal terms, see the{' '}
            <Link
              href="/community-guidelines/prize-drawings-rules"
              className="text-primary-500 underline"
            >
              Prize Drawing Rules
            </Link>
            .
          </p>
        </div>

        <SectionNav currentHref="/community-guidelines/prize-drawings-faq" />
      </Col>
    </Page>
  )
}
