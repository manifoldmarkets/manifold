import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, UsersIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import { SectionNav } from 'web/components/guidelines-sections'

export default function CommunityGuidelinesPlatformConductPage() {
  return (
    <Page trackPageView="community guidelines platform conduct page" className="!col-span-7">
      <SEO title="Community Guidelines — Platform Conduct" description="Platform conduct standards for Manifold users." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link href="/community-guidelines" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-500">
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="flex items-center gap-2 text-primary-500">
          <UsersIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Platform Conduct</h1>
        </div>

        <p className="mt-3 text-lg text-ink-600">
          Rules that apply across the platform and don't fit neatly into other sections.
        </p>

        <GuidelinesSearch />

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="mana-and-money" className="text-xl font-semibold text-ink-1000">Mana & money</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Selling mana to another user for real money is not allowed.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="messaging" className="text-xl font-semibold text-ink-1000">Messaging</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Unsolicited promotional direct messages are considered spam and may result in a ban.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="reviews" className="text-xl font-semibold text-ink-1000">Reviews</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Threatening another user in response to a poor resolution rating may result in warnings, suspension of creator privileges, or a ban.</li>
            <li>Leaving frequent inaccurate reviews may result in losing the ability to leave reviews and further disciplinary action.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="reporting-and-feedback" className="text-xl font-semibold text-ink-1000">Reporting & feedback</h2>
          <p className="mt-3 text-ink-700">If you believe a rule has been broken, you can report directly on the site using the three dots menu (…):</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>To report a user, use the three dots menu on a comment they've left, or on their profile page.</li>
            <li>To report a market, use the three dots menu on the market page.</li>
          </ul>
          <p className="mt-3 text-ink-700">You can also reach the team on <a className="text-primary-500 underline" href="https://discord.gg/2sHu6z9WMQ" target="_blank" rel="noreferrer">Discord</a> or by emailing <a className="text-primary-500 underline" href="mailto:info@manifold.markets">info@manifold.markets</a>.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="reporting-bugs-and-exploits" className="text-xl font-semibold text-ink-1000">Reporting bugs and exploits</h2>
          <p className="mt-3 text-ink-700">Found a bug or a potential exploit? Please report it before acting on it. For general bugs, use the <a className="text-primary-500 underline" href="https://discord.gg/2sHu6z9WMQ" target="_blank" rel="noreferrer">#bugs channel on Discord</a>. For security issues or exploits, email <a className="text-primary-500 underline" href="mailto:info@manifold.markets">info@manifold.markets</a> directly rather than posting publicly.</p>
        </div>

        <SectionNav currentHref="/community-guidelines/platform-conduct" />
      </Col>
    </Page>
  )
}
