import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, SparklesIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'

export default function CommunityGuidelinesCreatorGuidePage() {
  return (
    <Page
      trackPageView="community guidelines creator guide page"
      className="!col-span-7"
    >
      <SEO
        title="Community Guidelines — Creator Guide"
        description="Tips for running great markets on Manifold: clear criteria, fair close dates, and clean resolution."
      />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/community-guidelines/running-a-market"
          className="text-ink-500 hover:text-primary-500 mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Running a Market
        </Link>
        <div className="text-primary-500 flex items-center gap-2">
          <SparklesIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Creator Guide</h1>
        </div>

        <p className="text-ink-600 mt-3 text-lg">
          Tips for running great markets — practices that tend to produce
          active, fair, and well-resolved markets.
        </p>

        <GuidelinesSearch />

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="market-types" className="text-ink-1000 text-xl font-semibold">
            Market types
          </h2>
          <p className="text-ink-700 mt-3">
            Manifold has six question types. Pick the one that fits your
            question most naturally — the right type makes resolution cleaner
            and trading more meaningful.
          </p>
          <ul className="text-ink-700 mt-3 space-y-4">
            <li>
              <span className="font-semibold">Yes/No</span>
              <p className="mt-0.5">
                The standard binary market. Resolves YES, NO, or N/A. Best for
                questions with a clear true-or-false outcome.
              </p>
              <p className="text-ink-500 mt-0.5 text-sm italic">
                e.g. "Will X happen before [date]?"
              </p>
            </li>
            <li>
              <span className="font-semibold">Multiple Choice</span>
              <p className="mt-0.5">
                Several options, resolves to one (or splits between several).
                Good for elections, award nominees, or any question with a
                defined answer set.
              </p>
              <p className="text-ink-500 mt-0.5 text-sm italic">
                e.g. "Who will win the [award]?"
              </p>
            </li>
            <li>
              <span className="font-semibold">Set</span>
              <p className="mt-0.5">
                A group of independent Yes/No questions bundled under one title.
                Useful when the sub-questions share context but resolve
                separately.
              </p>
              <p className="text-ink-500 mt-0.5 text-sm italic">
                e.g. "Will each of these teams make the playoffs?"
              </p>
            </li>
            <li>
              <span className="font-semibold">Numeric</span>
              <p className="mt-0.5">
                Traders bet on a number within a range. Good for quantities,
                percentages, or scores.
              </p>
              <p className="text-ink-500 mt-0.5 text-sm italic">
                e.g. "How many units will X sell in Q4?"
              </p>
            </li>
            <li>
              <span className="font-semibold">Date</span>
              <p className="mt-0.5">
                Traders bet on when something will happen. Works best when the
                event is certain but the timing isn't.
              </p>
              <p className="text-ink-500 mt-0.5 text-sm italic">
                e.g. "When will X be officially announced?"
              </p>
            </li>
            <li>
              <span className="font-semibold">Poll</span>
              <p className="mt-0.5">
                Non-predictive voting with no resolution. Doesn't count toward
                Leagues or bonuses. Good for gauging opinion rather than
                forecasting an outcome.
              </p>
              <p className="text-ink-500 mt-0.5 text-sm italic">
                e.g. "Which of these features do you want most?"
              </p>
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="pick-a-clean-question"
            className="text-ink-1000 text-xl font-semibold"
          >
            Pick a clean question
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold">Falsifiable:</span> there should
              be a clear way to know YES vs NO when the time comes.
            </li>
            <li>
              <span className="font-semibold">Specific:</span> "Will an AI model
              score over 90% on benchmark X by date Y?" beats "Will AI get
              smarter this year?"
            </li>
            <li>
              <span className="font-semibold">Time-boxed:</span> a deadline
              avoids markets that drift forever.
            </li>
            <li>
              <span className="font-semibold">
                Has a real outcome you care about
              </span>{' '}
              — markets get more interesting when the creator is paying
              attention.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="write-resolution-criteria"
            className="text-ink-1000 text-xl font-semibold"
          >
            Write resolution criteria up front
          </h2>
          <p className="text-ink-700 mt-3">
            Spell out what counts as YES, what counts as NO, and what counts as
            N/A — before traders bet. The earlier this is locked, the fewer
            disputes you'll have later.
          </p>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Name the source you'll use (e.g. "official results from
              organization X").
            </li>
            <li>
              Cover the edge cases you can think of — event cancelled, source
              unavailable, ambiguous outcome.
            </li>
            <li>
              Avoid the word "by" with dates — it's ambiguous. Use "before
              [date]" if you mean before that day begins, or "before the end of
              [date]" if you mean by 11:59pm on that day.
            </li>
            <li>
              If you have to update criteria mid-market because new events
              happened, do it in the description and post a comment so traders
              see the change.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="engage-with-comments"
            className="text-ink-1000 text-xl font-semibold"
          >
            Engage with comments
          </h2>
          <p className="text-ink-700 mt-3">
            You don't have to, but it helps. Clarify criteria when traders ask.
            Pin a comment with the resolution source you'll use. Markets where
            the creator is engaged feel fairer to bet on.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="resolve-promptly"
            className="text-ink-1000 text-xl font-semibold"
          >
            Resolve promptly
          </h2>
          <p className="text-ink-700 mt-3">
            Once your criteria are met, resolve. Sitting on a resolved market
            locks up traders' mana and erodes trust. If you're not sure about
            the outcome, see the{' '}
            <Link
              href="/community-guidelines/resolving-markets"
              className="text-primary-500 underline"
            >
              Resolving Markets
            </Link>{' '}
            page.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="trader-bonuses"
            className="text-ink-1000 text-xl font-semibold"
          >
            Trader bonuses
          </h2>
          <p className="text-ink-700 mt-3">
            You can offset market creation costs by earning unique trader
            bonuses.
          </p>
          <p className="text-ink-700 mt-3">
            Every time a new unique trader bets on your market, you earn a mana
            bonus. The amount scales with your market's liquidity — more
            liquidity in the pool means more earned per trader. These bonuses
            count toward your{' '}
            <Link
              href="/community-guidelines/leagues"
              className="text-primary-500 underline"
            >
              Leagues
            </Link>{' '}
            score alongside your trading profit.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-50 mt-8 rounded-xl border-2 p-5">
          <p className="text-ink-700 text-sm">
            For the rules around what you can and can't do as a creator (vs.
            these tips), see{' '}
            <Link
              href="/community-guidelines/running-a-market"
              className="text-primary-500 underline"
            >
              Running a Market
            </Link>{' '}
            and{' '}
            <Link
              href="/community-guidelines/market-policies"
              className="text-primary-500 underline"
            >
              Market Policies
            </Link>
            .
          </p>
        </div>
      </Col>
    </Page>
  )
}
