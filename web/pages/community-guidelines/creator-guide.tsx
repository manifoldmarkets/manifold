import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, SparklesIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'

export default function CommunityGuidelinesCreatorGuidePage() {
  return (
    <Page trackPageView="community guidelines creator guide page" className="!col-span-7">
      <SEO title="Community Guidelines — Creator Guide" description="Tips for running great markets on Manifold: clear criteria, fair close dates, and clean resolution." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link href="/community-guidelines/running-a-market" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-500">
          <ChevronLeftIcon className="h-4 w-4" /> Running a Market
        </Link>
        <div className="flex items-center gap-2 text-primary-500">
          <SparklesIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Creator Guide</h1>
        </div>

        <p className="mt-3 text-lg text-ink-600">
          Tips for running great markets — practices that tend to produce active, fair, and well-resolved markets.
        </p>

        <GuidelinesSearch />

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="pick-a-clean-question" className="text-xl font-semibold text-ink-1000">Pick a clean question</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Falsifiable: there should be a clear way to know YES vs NO when the time comes.</li>
            <li>Specific: "Will an AI model score over 90% on benchmark X by date Y?" beats "Will AI get smarter this year?"</li>
            <li>Time-boxed: a deadline avoids markets that drift forever.</li>
            <li>Has a real outcome you care about — markets get more interesting when the creator is paying attention.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="write-resolution-criteria" className="text-xl font-semibold text-ink-1000">Write resolution criteria up front</h2>
          <p className="mt-3 text-ink-700">Spell out what counts as YES, what counts as NO, and what counts as N/A — before traders bet. The earlier this is locked, the fewer disputes you'll have later.</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Name the source you'll use (e.g. "official results from organization X").</li>
            <li>Cover the edge cases you can think of — event cancelled, source unavailable, ambiguous outcome.</li>
            <li>If you have to update criteria mid-market because new events happened, do it in the description and post a comment so traders see the change.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="pick-a-reasonable-close-date" className="text-xl font-semibold text-ink-1000">Pick a reasonable close date</h2>
          <p className="mt-3 text-ink-700">Close shortly before the outcome is known, not after. Closing too early kills late-information trading; closing too late lets people pile in once the answer is obvious.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="engage-with-comments" className="text-xl font-semibold text-ink-1000">Engage with comments</h2>
          <p className="mt-3 text-ink-700">You don't have to, but it helps. Clarify criteria when traders ask. Pin a comment with the resolution source you'll use. Markets where the creator is engaged feel fairer to bet on.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="resolve-promptly" className="text-xl font-semibold text-ink-1000">Resolve promptly</h2>
          <p className="mt-3 text-ink-700">Once your criteria are met, resolve. Sitting on a resolved market locks up traders' mana and erodes trust. If you're not sure about the outcome, see the <Link href="/community-guidelines/resolving-markets" className="text-primary-500 underline">Resolving Markets</Link> page.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="when-all-else-fails-na" className="text-xl font-semibold text-ink-1000">When all else fails, N/A</h2>
          <p className="mt-3 text-ink-700">N/A returns mana to traders at their cost basis and isn't a black mark. It's the right move when:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>The outcome is genuinely unknowable.</li>
            <li>An event was cancelled or the criteria are no longer achievable.</li>
            <li>You realized the question was ambiguous and there's no fair way to call it.</li>
          </ul>
          <p className="mt-3 text-ink-700">N/A is a release valve. Use it without guilt when needed — but don't reach for it just to dodge a hard call.</p>
        </div>

        <div className="mt-8 rounded-xl border-2 border-ink-200 bg-canvas-50 p-5">
          <p className="text-sm text-ink-700">
            For the rules around what you can and can't do as a creator (vs. these tips), see <Link href="/community-guidelines/running-a-market" className="text-primary-500 underline">Running a Market</Link>.
          </p>
        </div>
      </Col>
    </Page>
  )
}
