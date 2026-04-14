import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { CollectionIcon } from '@heroicons/react/outline'

export default function CommunityGuidelinesRunningAMarketPage() {
  return (
    <Page trackPageView="community guidelines running a market page" className="!col-span-7">
      <SEO title="Community Guidelines — Running a Market" description="Guidelines for creating and managing markets on Manifold." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-primary-500">
          <CollectionIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Running a Market</h1>
        </div>

        <p className="mt-3 text-lg text-ink-400">
          Guidelines for creating and managing markets on Manifold.
        </p>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Market Creation</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Markets should have clear, unambiguous resolution criteria.</li>
            <li>Include a reasonable close date and resolution date.</li>
            <li>Write engaging descriptions that provide context and relevant information.</li>
            <li>Avoid creating markets that could be seen as spam or low-effort.</li>
            <li>Personal markets must be clearly declared in the market description.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Ban List</h2>
          <p className="mt-3 text-ink-700">The following topics are banned from markets:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>Illegal activities or content that violates laws.</li>
            <li>Harmful or dangerous content that could encourage harm.</li>
            <li>Personal information or doxxing of individuals.</li>
            <li>Markets designed to manipulate or harass others.</li>
            <li>Spam markets or those created solely for bonuses.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Labeling Rankings</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Use appropriate tags and categories for your markets.</li>
            <li>Rankings should reflect the market's importance and relevance.</li>
            <li>Avoid artificially inflating rankings through manipulation.</li>
            <li>Personal markets should be labeled as such to avoid confusion.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Market Rules</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Follow the established market rules and mechanics.</li>
            <li>Resolve markets promptly and fairly once the outcome is known.</li>
            <li>Provide clear reasoning for resolutions, especially in disputed cases.</li>
            <li>Avoid abandoning markets without resolution.</li>
            <li>Report any issues or disputes to moderators if needed.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Personal Markets</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Personal markets must be clearly declared in the title or description.</li>
            <li>Examples include "Will I finish my project by Friday?" or "Will my team win the game?"</li>
            <li>Personal markets should not deceive other users about their nature.</li>
            <li>They are allowed but must be transparent about being personal wagers.</li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}