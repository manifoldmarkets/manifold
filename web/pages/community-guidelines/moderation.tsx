import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ShieldCheckIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'

export default function CommunityGuidelinesModerationPage() {
  return (
    <Page trackPageView="community guidelines moderation page" className="!col-span-7">
      <SEO title="Community Guidelines — Moderation" description="Community moderation policies and procedures." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-primary-500">
          <ShieldCheckIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Moderation</h1>
        </div>

        <p className="mt-3 text-lg text-ink-400">
          Manifold Mods are community members who help keep markets accurate, resolve disputes, and maintain a healthy environment. This page explains who they are, what they can do, and how to escalate if something goes wrong.
        </p>

        <GuidelinesSearch />

        <div className="mt-4 rounded-xl border-2 border-ink-200 bg-canvas-50 p-5">
          <p className="text-sm text-ink-700">
            Note: Mod alerts and temporary bans are a normal part of how Manifold handles guideline violations — they're not a permanent mark against you. Think of them as a nudge rather than a punishment. Repeat or serious violations are treated differently.
          </p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="what-mods-do" className="text-xl font-semibold text-ink-900">What Mods do</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Ensure markets are resolved promptly and accurately</li>
            <li>Clarify ambiguous markets when creators are unresponsive</li>
            <li>Issue warnings and bans for guideline violations</li>
            <li>Set a good example for the broader community</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="who-mods-are" className="text-xl font-semibold text-ink-900">Who Mods are</h2>
          <p className="mt-3 text-ink-700">Mods are active Manifold users selected by the community manager. New Mods are considered when needed. Candidates are expected to be open-minded, fair, active on the platform, and willing to engage with Discord's #mod-help channel and @mods site tag.</p>
          <p className="mt-3 text-ink-700">Mod status isn't permanent — it can be removed and reinstated. Reasons include inactivity, conduct issues, or simply not wanting to do the work anymore. This isn't a mark against anyone; it's just how the role works.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="actions-mods-can-take" className="text-xl font-semibold text-ink-900">Actions Mods can take</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Issue warnings via mod alerts — anonymous dismissible banners sent directly to a user</li>
            <li>Apply restrictions: posting, market control, or trading bans of varying lengths</li>
            <li>Hide or delete comments that violate comment guidelines</li>
            <li>Unlist, unrank, or unsubsidize markets</li>
            <li>Edit market titles and descriptions when criteria need clarification</li>
            <li>Resolve or unresolve markets in specific circumstances</li>
            <li>Change market closing dates</li>
            <li>Pin comments that provide essential market context</li>
          </ul>
          <p className="mt-3 text-sm text-ink-600">Mods escalate permanent bans and complex situations to admins rather than acting unilaterally.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="how-market-resolution-works" className="text-xl font-semibold text-ink-900">How market resolution works</h2>
          <p className="mt-3 text-ink-700">Mods can resolve markets on behalf of inactive creators when resolution criteria are unambiguous. For actively disputed resolutions, the process is:</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-700">
            <li>A Mod who holds no position in the market takes ownership</li>
            <li>They post a comment explaining the proposed criteria</li>
            <li>The creator has 48 hours to respond and reclaim ownership</li>
            <li>If no response, the mod runs the market from that point</li>
          </ol>
          <p className="mt-3 text-ink-700">Mods can also correct blatantly wrong resolutions. If a resolution is defensible even if imperfect, they'll comment suggestions but leave the final call to the creator.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="if-you-think-a-mod-decision-was-wrong" className="text-xl font-semibold text-ink-900">If you think a Mod decision was wrong</h2>
          <p className="mt-3 text-ink-700">
            Reach out on <a className="text-primary-500 underline" href="https://discord.gg/2sHu6z9WMQ" target="_blank" rel="noreferrer">Discord</a> or email <a className="text-primary-500 underline" href="mailto:info@manifold.markets">info@manifold.markets</a>. For large markets or situations getting significant blowback, tag <a className="text-primary-500 underline" href="https://manifold.markets/shankypanky" target="_blank" rel="noreferrer">@shankypanky</a> directly to loop her in.
          </p>
        </div>
      </Col>
    </Page>
  )
}
