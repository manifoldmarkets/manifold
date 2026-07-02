import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, ScaleIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import { SectionNav } from 'web/components/guidelines-sections'

export default function CommunityGuidelinesRunningAMarketPage() {
  return (
    <Page
      trackPageView="community guidelines running a market page"
      className="!col-span-7"
    >
      <SEO
        title="Community Guidelines — Running a Market"
        description="Guidelines for creating and managing markets on Manifold."
      />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/community-guidelines"
          className="text-ink-500 hover:text-primary-500 mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="text-primary-500 flex items-center gap-2">
          <ScaleIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Running a Market</h1>
        </div>

        <p className="text-ink-600 mt-3 text-lg">
          Creators are held to a higher standard than general users. The
          platform has game-like incentives and we want you to have fun with
          them, but not by exploiting loopholes or technicalities on your own
          markets.
        </p>
        <p className="text-ink-600 mt-2 text-sm italic">
          Looking for tips on running great markets? See the{' '}
          <Link
            href="/community-guidelines/creator-guide"
            className="text-primary-500 underline"
          >
            Creator Guide
          </Link>
          .
        </p>

        <GuidelinesSearch />

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="keep-your-criteria-clear"
            className="text-ink-1000 text-xl font-semibold"
          >
            Keep your criteria clear and current
          </h2>
          <p className="text-ink-700 mt-3">
            You're responsible for maintaining resolution criteria that traders
            can rely on. Write them clearly before anyone bets, and if events
            change and your original criteria no longer make sense, update the
            description and post a comment so traders are aware. Vague or
            shifting criteria are the most common source of disputes on the
            platform.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="trade-in-good-faith"
            className="text-ink-1000 text-xl font-semibold"
          >
            Trade in good faith
          </h2>
          <p className="text-ink-700 mt-3">
            Don't exploit ambiguity in your own resolution criteria or use
            loopholes for personal gain. Traders are trusting you to call it
            straight. The fact that you created the market doesn't give you an
            advantage over the people betting on it.
          </p>
          <p className="text-ink-700 mt-3">
            If you want to make that commitment public, you can permanently
            block yourself from trading on your own market. The option is in the
            market info card — once set, it's visible to all traders and can
            only be undone by a Moderator or admin. Traders can and do request
            this before placing bets on markets where creator bias is a concern.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="be-reachable" className="text-ink-1000 text-xl font-semibold">
            Be reachable
          </h2>
          <p className="text-ink-700 mt-3">
            If traders are asking questions in the comments, respond. If your
            market is being disputed, engage. An unresponsive creator is one of
            the most common reasons Mods have to step in. You don't have to be
            glued to your market, but you should be checking in.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="resolve-promptly-and-honestly"
            className="text-ink-1000 text-xl font-semibold"
          >
            Resolve promptly and honestly
          </h2>
          <p className="text-ink-700 mt-3">
            Once your criteria are met, resolve. Don't sit on it — unresolved
            markets lock up traders' mana and erode trust in the platform. If
            you're unsure about the outcome, check with Mods before resolving,
            not after. See the{' '}
            <Link
              href="/community-guidelines/resolving-markets"
              className="text-primary-500 underline"
            >
              Resolving Markets
            </Link>{' '}
            page for detail on the resolution process and when Mods can step in.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="youre-not-on-your-own"
            className="text-ink-1000 text-xl font-semibold"
          >
            You're not on your own
          </h2>
          <p className="text-ink-700 mt-3">
            If you're unsure how to resolve a market, your criteria have become
            unclear, or a dispute is getting out of hand — Mods are here to
            help. Reach out before you make a call you're not confident in, not
            after. See the{' '}
            <Link
              href="/community-guidelines/moderation"
              className="text-primary-500 underline"
            >
              Moderation
            </Link>{' '}
            page for how to get mod support and what they can do.
          </p>
        </div>

        <SectionNav currentHref="/community-guidelines/running-a-market" />
      </Col>
    </Page>
  )
}
