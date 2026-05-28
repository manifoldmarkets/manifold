import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import Link from 'next/link'
import { ChevronLeftIcon, ShieldCheckIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import { SectionNav } from 'web/components/guidelines-sections'

export default function CommunityGuidelinesModerationPage() {
  return (
    <Page trackPageView="community guidelines moderation page" className="!col-span-7">
      <SEO title="Community Guidelines — Moderation" description="Community moderation policies and procedures." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link href="/community-guidelines" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-500">
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="flex items-center gap-2 text-primary-500">
          <ShieldCheckIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Moderation</h1>
        </div>

        <p className="mt-3 text-lg text-ink-600">
          Manifold Mods are community members who help keep markets accurate, resolve disputes, and maintain a healthy environment. This page explains who they are, what they can do, and how to get their help.
        </p>

        <GuidelinesSearch />

        <div className="mt-4 rounded-xl border-2 border-ink-200 bg-canvas-50 p-5">
          <p className="text-sm text-ink-700">
            Note: Mod alerts and temporary bans are a normal part of how Manifold handles guideline violations — they're not a permanent mark against you. Think of them as a nudge rather than a punishment. Repeat or serious violations are treated differently.
          </p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="what-mods-do" className="text-xl font-semibold text-ink-1000">What Mods do</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Ensure markets are resolved promptly and accurately</li>
            <li>Clarify ambiguous markets when creators are unresponsive</li>
            <li>Issue warnings and bans for guideline violations</li>
            <li>Set a good example for the broader community</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="who-mods-are" className="text-xl font-semibold text-ink-1000">Who Mods are</h2>
          <p className="mt-3 text-ink-700">Mods are active Manifold users selected by the community manager. New Mods are considered when needed. Candidates are expected to be open-minded, fair, active on the platform, and willing to engage with Discord's #mod-help channel and the @mods site tag.</p>
          <p className="mt-3 text-ink-700">Mod status isn't permanent — it can be removed and reinstated. Reasons include inactivity, conduct issues, or simply not wanting to do the work anymore. This isn't a mark against anyone; it's just how the role works.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="actions-mods-can-take" className="text-xl font-semibold text-ink-1000">Actions Mods can take</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Issue warnings via mod alerts — anonymous dismissible banners sent directly to a user</li>
            <li>Apply restrictions: posting, market control, or trading bans of varying lengths</li>
            <li>Hide or delete comments that violate comment guidelines</li>
            <li>Unlist or unrank markets</li>
            <li>Edit market titles and descriptions when criteria need clarification</li>
            <li>Resolve or unresolve markets in specific circumstances</li>
            <li>Change market closing dates</li>
            <li>Pin comments that provide essential market context</li>
          </ul>
          <p className="mt-3 text-sm text-ink-600">Mods escalate permanent bans and complex situations to admins rather than acting unilaterally.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="how-to-request-mod-help" className="text-xl font-semibold text-ink-1000">How to request mod help</h2>
          <p className="mt-3 text-ink-700">If you need a Mod to resolve a market, post a comment on the market with your desired resolution and a source or reasoning. This helps Mods act quickly and accurately.</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>If the creator has been active on the site within the last month, ping them first and wait at least 24 hours for a response before requesting mod intervention.</li>
            <li>If the creator has been inactive for more than a month, you can request mod help directly without waiting.</li>
            <li>Use the @mods tag on the market itself to flag it for the mod queue.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="how-market-resolution-works" className="text-xl font-semibold text-ink-1000">How market resolution works</h2>
          <p className="mt-3 text-ink-700">The process depends on how clear-cut the resolution is.</p>
          <p className="mt-4 text-ink-700 italic">For unambiguous resolutions (e.g. a sports result with a clear outcome):</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>A Mod reviews the market and resolves it based on the stated criteria and available evidence.</li>
            <li>Mods may resolve even if they hold a position in the market, provided the outcome is clearly unambiguous.</li>
          </ul>
          <p className="mt-4 text-ink-700 italic">For ambiguous or disputed resolutions:</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-ink-700">
            <li>A Mod who holds no position in the market takes ownership</li>
            <li>They post a comment explaining the proposed criteria</li>
            <li>The creator has 48 hours to respond and reclaim ownership</li>
            <li>If no response, the Mod runs the market from that point</li>
          </ol>
          <p className="mt-3 text-ink-700">Mods can also correct blatantly wrong resolutions. If a resolution is defensible even if imperfect, they'll comment suggestions but leave the final call to the creator.</p>
          <p className="mt-3 text-ink-700">N/A is a last resort — used only when resolution genuinely cannot be determined after Mods have tried to support clarification. It is not a default response to ambiguity.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-50 p-5">
          <p className="text-sm text-ink-700">
            Curious about the playbook mods actually follow — thresholds, escalation, ban guidance? See the <Link href="/community-guidelines/moderation-guidelines-internal" className="text-primary-500 underline">Mod Guidelines</Link>.
          </p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="if-you-think-a-mod-decision-was-wrong" className="text-xl font-semibold text-ink-1000">If you think a Mod decision was wrong</h2>
          <p className="mt-3 text-ink-700">
            Reach out on <a className="text-primary-500 underline" href="https://discord.gg/2sHu6z9WMQ" target="_blank" rel="noreferrer">Discord</a> or email <a className="text-primary-500 underline" href="mailto:info@manifold.markets">info@manifold.markets</a>. For large markets or situations getting significant blowback, tag <a className="text-primary-500 underline" href="https://manifold.markets/shankypanky" target="_blank" rel="noreferrer">@shankypanky</a> directly to loop her in.
          </p>
        </div>

        <SectionNav currentHref="/community-guidelines/moderation" />
      </Col>
    </Page>
  )
}
