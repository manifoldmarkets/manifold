import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { CheckCircleIcon, ChevronLeftIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import { SectionNav } from 'web/components/guidelines-sections'

export default function CommunityGuidelinesResolvingMarketsPage() {
  return (
    <Page
      trackPageView="community guidelines resolving markets page"
      className="!col-span-7"
    >
      <SEO
        title="Community Guidelines — Resolving Markets"
        description="Guidelines for resolving markets correctly and promptly on Manifold."
      />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/community-guidelines"
          className="text-ink-500 hover:text-primary-500 mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="text-primary-500 flex items-center gap-2">
          <CheckCircleIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Resolving Markets</h1>
        </div>

        <p className="text-ink-600 mt-3 text-lg">
          Market creators are responsible for resolving their markets correctly
          and promptly once resolution criteria are met.
        </p>

        <GuidelinesSearch />

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="creator-resolution"
            className="text-ink-1000 text-xl font-semibold"
          >
            Creator resolution
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Resolve your market as soon as criteria are met — don't leave it
              sitting.
            </li>
            <li>
              You have 10 minutes to un-resolve and re-resolve if you made a
              mistake. Don't abuse this window — doing so may result in a fine
              or ban.
            </li>
            <li>
              If you made a mistake, post a comment on the market tagging @mods
              to request a re-resolution.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="when-manifold-can-override"
            className="text-ink-1000 text-xl font-semibold"
          >
            When Manifold can override you
          </h2>
          <p className="text-ink-700 mt-3">
            Creators typically have final say, but not always:
          </p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>
              Manifold or Mods may resolve your market if unambiguous criteria
              have been met and you're unresponsive.
            </li>
            <li>
              For resolutions that are more ambiguous or disputed amongst
              traders, creators cede decision making to Mods if they hold a
              position on the outcome. A Mod or Mods who does not hold a
              position will review.
            </li>
            <li>
              Manifold reserves the right to re-resolve any market resolved
              fraudulently — including markets created before this policy.
            </li>
            <li>
              If resolution is genuinely ambiguous or the outcome is proving
              contentious, Mods are here to help. In the comments, tag @mods for
              support in finding the best solution.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="abandoned-markets"
            className="text-ink-1000 text-xl font-semibold"
          >
            Abandoned markets
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              If you've been inactive and your market has unambiguous resolution
              criteria, a Moderator may resolve it on your behalf. See the{' '}
              <a
                className="text-primary-500 underline"
                href="/community-guidelines/moderation"
              >
                Mod Guidelines
              </a>{' '}
              for the exact process.
            </li>
          </ul>
        </div>

        <SectionNav currentHref="/community-guidelines/resolving-markets" />
      </Col>
    </Page>
  )
}
