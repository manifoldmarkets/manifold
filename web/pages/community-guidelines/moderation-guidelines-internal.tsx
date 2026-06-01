import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, ShieldCheckIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'

export default function ModerationGuidelinesInternalPage() {
  return (
    <Page trackPageView="moderation guidelines page" className="!col-span-7">
      <SEO
        title="Moderation Guidelines"
        description="How Manifold mods are expected to act, decide, and escalate."
      />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/community-guidelines"
          className="text-ink-500 hover:text-primary-500 mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="text-primary-500 flex items-center gap-2">
          <ShieldCheckIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Moderation Guidelines</h1>
        </div>

        <p className="text-ink-600 mt-3 text-lg">
          How Manifold mods are expected to act, decide, and escalate. Published
          so the community can see the same playbook the mods follow. For
          user-facing moderation info — what mods do, how to request help, how
          to appeal — see the{' '}
          <Link
            href="/community-guidelines/moderation"
            className="text-primary-500 underline"
          >
            Moderation
          </Link>{' '}
          page.
        </p>

        <GuidelinesSearch />

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="role-expectations"
            className="text-ink-1000 text-xl font-semibold"
          >
            Role expectations
          </h2>
          <p className="text-ink-700 mt-3">Mods are expected to:</p>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Be welcoming and fair — a lot of moderation is nuanced and will
              upset someone. Own your mistakes openly.
            </li>
            <li>
              Go above and beyond the guidelines without exploiting
              technicalities or oversights.
            </li>
            <li>
              Stay active on Manifold and check #mod-help in Discord regularly.
            </li>
            <li>Work collaboratively with the team and other mods.</li>
          </ul>
          <p className="text-ink-700 mt-3">
            Mod status can be removed and reinstated without it being a
            reflection on you personally. Reasons for removal include:
          </p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>Not wanting to do the work</li>
            <li>Extended inactivity</li>
            <li>
              Being consistently negative toward Manifold, staff, or users — we
              have high tolerance here and will warn first
            </li>
            <li>A communication style that consistently creates conflict</li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="how-new-mods-are-chosen"
            className="text-ink-1000 text-xl font-semibold"
          >
            How new mods are chosen
          </h2>
          <p className="text-ink-700 mt-3">
            Once a month during the mod call, the team reviews whether new mods
            are needed and discusses candidates. Candidates should exceed the
            expectations above.
          </p>
          <p className="text-ink-700 mt-3">
            A casual poll goes out to existing mods to vouch or raise concerns.
            The community manager makes the final decision and sends the
            onboarding form to selected users.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="ban-types" className="text-ink-1000 text-xl font-semibold">
            Ban types
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="text-ink-700 w-full text-sm">
              <thead>
                <tr className="border-ink-200 border-b">
                  <th className="text-ink-1000 pb-2 pr-6 text-left font-semibold">
                    Ban type
                  </th>
                  <th className="text-ink-1000 pb-2 text-left font-semibold">
                    What it blocks
                  </th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y">
                <tr>
                  <td className="py-2 pr-6 font-medium">Posting</td>
                  <td className="py-2">
                    Commenting, messaging, creating posts, adding answers, poll
                    voting
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-6 font-medium">Market control</td>
                  <td className="py-2">
                    Creating, editing, resolving markets, hiding comments,
                    adding/editing answers, poll voting
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-6 font-medium">Trading</td>
                  <td className="py-2">
                    Betting, managrams, liquidity changes, adding answers,
                    boosting markets, poll voting
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-ink-700 mt-4">When to use which:</p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>General bad actors: consider all three</li>
            <li>Spam or harassment: posting ban is usually sufficient</li>
            <li>Market abuse: market control ban, possibly with trading ban</li>
            <li>Financial manipulation: trading ban</li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="ban-guidelines"
            className="text-ink-1000 text-xl font-semibold"
          >
            Ban guidelines
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Always include a reason — the user sees it as a banner and it
              stays on record for future mods. Be information-dense and
              impersonal.
            </li>
            <li>
              Consider the user's warning and ban history. Repeat offenders get
              treated more harshly.
            </li>
            <li>
              Mods should only issue permanent bans for obvious spam. All other
              permanent bans go to admins.
            </li>
            <li>
              If someone is actively problematic, issue a warning first. If they
              escalate, contact the community manager. As a last resort, issue a
              temporary ban and make that clear to the user.
            </li>
            <li>
              Self-promotion by a genuine user is not spam unless posted across
              many unrelated markets in large quantities.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="mod-alerts" className="text-ink-1000 text-xl font-semibold">
            Mod alerts
          </h2>
          <p className="text-ink-700 mt-3">
            Mod alerts send an anonymous dismissible banner to a user. Use them
            to deliver warnings, keep a record, and make sure the user sees it
            without attaching your name to it.
          </p>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Keep alerts information-dense and impersonal — they're a record as
              much as a message.
            </li>
            <li>Don't use mod alerts to anonymously attack users.</li>
            <li>
              Once dismissed, the alert no longer shows as active on the ban
              management page.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="market-intervention-thresholds"
            className="text-ink-1000 text-xl font-semibold"
          >
            Market intervention thresholds
          </h2>
          <p className="text-ink-700 mt-3">
            You can initiate a mod takeover of a market when all of the
            following are true:
          </p>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>Over 40 traders</li>
            <li>
              There's an influx of activity or new events requiring criteria
              clarification
            </li>
            <li>
              The creator is unresponsive for at least 24 hours — use judgment
              if they're generally active or it's not urgent
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="the-takeover-process"
            className="text-ink-1000 text-xl font-semibold"
          >
            The takeover process
          </h2>
          <ol className="text-ink-700 mt-3 list-decimal space-y-2 pl-5">
            <li>
              A mod who holds no significant position in the market is delegated
              as new market owner. They commit to not buying shares to stay
              impartial.
            </li>
            <li>
              Delegated mod comments and edits the description explaining what's
              happening and the proposed new criteria.
            </li>
            <li>
              Creator has 48 hours to return and override the new criteria.
            </li>
            <li>
              If they don't return, the mod runs the market from that point.
            </li>
            <li>
              If the creator returns and wants to reclaim the market, they need
              a good reason to modify the mod's criteria. If they hold a lot of
              shares and are trying to swing the market in their favor, you can
              deny them. Escalate to the community manager if needed.
            </li>
          </ol>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="resolving-abandoned-markets"
            className="text-ink-1000 text-xl font-semibold"
          >
            Resolving abandoned markets
          </h2>
          <p className="text-ink-700 mt-3">
            When is it okay to resolve another creator's market?
          </p>
          <p className="text-ink-700 mt-3 font-medium">
            Assuming resolution is obvious:
          </p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>
              Markets by Tomek, NathanYoung, Gigacasting, the Manifold Markets
              account, and Manifold staff can be resolved as soon as criteria
              are met.
            </li>
            <li>If the creator is inactive, you may resolve.</li>
            <li>
              If the creator is active, ping them in a comment and resolve if no
              response after 1 day.
            </li>
          </ul>
          <p className="text-ink-700 mt-3 font-medium">
            If the close date has passed and resolution is ambiguous:
          </p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>
              Reopen the market if appropriate. Ask the creator if they're
              active.
            </li>
            <li>
              If criteria have technically been met but interpretation is
              unclear, try to get the creator to resolve first. Waiting a couple
              of months is fine given the loan system.
            </li>
            <li>
              If 3 out of 3 mods unanimously agree on the interpretation, you
              can resolve that way — roughly 1 week after close if the creator
              is inactive.
            </li>
            <li>Failing the above, resolve N/A.</li>
          </ul>
          <p className="text-ink-600 mt-3 text-sm">
            <span className="font-medium">"Active" is defined as</span> any
            creator who has made a bet, comment, or market in the past 2 weeks.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="handling-fraudulent-or-disputed-resolutions"
            className="text-ink-1000 text-xl font-semibold"
          >
            Handling fraudulent or disputed resolutions
          </h2>
          <p className="text-ink-700 mt-3">
            You can unresolve and correct a market when:
          </p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>The creator asks you to because they made a mistake</li>
            <li>
              The creator resolved too early but in the right direction — don't
              force it back, ask them to unresolve and set a new close date. If
              they refuse, leave it and re-resolve later if events play out
              differently.
            </li>
            <li>
              The resolution is blatantly wrong by any reasonable reading —
              correct it and warn the creator.
            </li>
          </ul>
          <p className="text-ink-700 mt-3">Do not change a resolution when:</p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>
              It's defensible even if imperfect — comment suggestions but leave
              the final call to the creator.
            </li>
            <li>
              A creator is a large benefactor of an ambiguous resolution — give
              benefit of the doubt the first time with a warning, unless it's
              clearly fraudulent. Escalate repeat infractions.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="when-to-escalate"
            className="text-ink-1000 text-xl font-semibold"
          >
            When to escalate to the community manager
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Market is large (over 80 traders) and needs creator input — ask
              the community manager to email them directly.
            </li>
            <li>
              You've issued a correction or warning for a questionable
              resolution, especially if the creator benefited — always loop in
              the community manager.
            </li>
            <li>
              Any situation that's unique, unclear, or getting significant
              blowback from creators or users.
            </li>
            <li>Any permanent ban that isn't obvious spam.</li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}
