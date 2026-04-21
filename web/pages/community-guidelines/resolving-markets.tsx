import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { CheckCircleIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'

export default function CommunityGuidelinesResolvingMarketsPage() {
  return (
    <Page trackPageView="community guidelines resolving markets page" className="!col-span-7">
      <SEO title="Community Guidelines — Resolving Markets" description="Guidelines for resolving markets correctly and promptly on Manifold." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-primary-500">
          <CheckCircleIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Resolving Markets</h1>
        </div>

        <p className="mt-3 text-lg text-ink-400">
          Market creators are responsible for resolving their markets correctly and promptly once resolution criteria are met.
        </p>

        <GuidelinesSearch />

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="creator-resolution" className="text-xl font-semibold text-ink-900">Creator resolution</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Resolve your market as soon as criteria are met — don't leave it sitting.</li>
            <li>You have 10 minutes to un-resolve and re-resolve if you made a mistake. Don't abuse this window — doing so may result in a fine or ban.</li>
            <li>If you made a mistake, tag @mods or an admin to request a re-resolution.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="when-manifold-can-override" className="text-xl font-semibold text-ink-900">When Manifold can override you</h2>
          <p className="mt-3 text-ink-700">Creators typically have final say, but not always:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>Manifold or mods may resolve your market if unambiguous criteria have been met and you're unresponsive.</li>
            <li>For resolutions that are more ambiguous or disputed amongst traders, creators cede decision making to Mods if they hold a position on the outcome. A Mod or Mods who does not hold a position will review.</li>
            <li>Manifold reserves the right to re-resolve any market resolved fraudulently — including markets created before this policy.</li>
            <li>If resolution is genuinely ambiguous, we recommend resolving N/A, especially if the ambiguity is the creator's fault. Please check with Mods first for support in this decision.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="abandoned-markets" className="text-xl font-semibold text-ink-900">Abandoned markets</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>If you've been inactive and your market has unambiguous resolution criteria, a moderator may resolve it on your behalf. See the <a className="text-primary-500 underline" href="/community-guidelines/moderation">Mod guidelines</a> for the exact process.</li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}
