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
            id="handling-duplicate-markets"
            className="text-ink-1000 text-xl font-semibold"
          >
            Handling duplicate markets
          </h2>
          <p className="text-ink-700 mt-3">
            Treat a market as a duplicate when an existing open market asks
            substantially the same question and there's no meaningful difference
            in resolution criteria, timeframe, or resolution source. A different
            wording of the same question is still a duplicate. A genuinely
            different bar — a different date, threshold, or source — is not.
          </p>
          <p className="text-ink-700 mt-3">
            Duplicates aren't a moral failing, they're a liquidity problem: two
            markets on one question are both thinner and easier for arbitrage
            bots to farm. Default to fixing the market state rather than
            punishing the creator.
          </p>
          <p className="text-ink-700 mt-3">Which lever to pull:</p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium">First instance, good faith:</span>{' '}
              comment linking the original, and unrank the duplicate. Point the
              creator at the older market. If no real trading has occurred on it
              yet, ask them to N/A it themselves — if they don't, delist it or
              resolve it N/A directly, since nobody's position is affected.
            </li>
            <li>
              <span className="font-medium">Duplicate with traders:</span>{' '}
              unrank rather than unlist — unlisting strands people who've
              already bet. Link the two markets in comments on both.
            </li>
            <li>
              <span className="font-medium">Repeat offender:</span> mod alert
              citing the previous instance, then a fine. Loop in the community
              manager once you're issuing fines for a pattern.
            </li>
            <li>
              <span className="font-medium">Bulk or farming:</span> duplicates
              created in volume, or aimed at league points, bonuses, or
              engagement, are spam — unlist or delete, and apply a market
              control ban. Escalate as with any other market abuse.
            </li>
          </ul>
          <p className="text-ink-700 mt-3">
            Creator reliability is a legitimate reason to duplicate, and worth
            checking before you unrank anything. Where the original leaves real
            room for interpretation — thin criteria, or a judgement call at
            resolution — and the creator holds a position, has previously
            resolved their own ambiguous markets in their favour, or has gone
            unresponsive, a tighter version run by someone impartial is a
            reasonable thing for a trader to build. Leave it ranked, and treat
            the original as the market with the problem: it's usually a
            candidate for a takeover or criteria clarification rather than the
            new one being a candidate for unranking.
          </p>
          <p className="text-ink-700 mt-3">
            Hold that reason to a real standard, though — "I don't trust the
            creator" is the natural cover story for someone who just doesn't
            like the price. Ask whether the original is genuinely ambiguous, and
            whether they tried to fix it first by asking the creator or tagging
            @mods. If the original resolves cleanly on its stated criteria and
            the complaint is really about the direction it's moving, it's a
            plain duplicate.
          </p>
          <p className="text-ink-700 mt-3">
            A creator remaking their own market because the original no longer
            reflects what they meant to ask is not a duplicate — that's the
            behaviour we ask for over materially rewriting criteria traders have
            already bet on. Check the old market gets closed out or N/A'd rather
            than left running alongside the new one.
          </p>
          <p className="text-ink-700 mt-3">
            Don't act on duplicates where the newer market is clearly the better
            one — better criteria, better sourced, more traders — just because
            it came second. In that case leave both ranked and comment linking
            them, or ask the original creator whether they want to N/A theirs.
          </p>
          <p className="text-ink-600 mt-3 text-sm">
            The create page already surfaces similar open markets as a creator
            types their title, so a near-identical title is usually careless
            rather than unlucky. Worth saying in the alert — it's the reason "I
            didn't know" doesn't hold up.
          </p>
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
