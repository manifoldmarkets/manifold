import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { CheckCircleIcon } from '@heroicons/react/outline'

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

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Creator Resolution</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Resolve your market as soon as criteria are met — don't leave it sitting.</li>
            <li>You have 10 minutes to un-resolve and re-resolve if you made a mistake. Don't abuse this window — doing so may result in a fine or ban.</li>
            <li>If you made a mistake, tag @mods or an admin to request a re-resolution.</li>
            <li>Provide clear reasoning for your resolution, especially in disputed cases.</li>
            <li>Avoid resolving markets prematurely or based on incomplete information.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">When Manifold Can Override You</h2>
          <p className="mt-3 text-ink-700">Creators typically have final say, but not always:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-700">
            <li>Manifold or mods may resolve your market if unambiguous criteria have been met and you're unresponsive.</li>
            <li>Manifold reserves the right to re-resolve any market resolved fraudulently — including markets created before this policy.</li>
            <li>If resolution is genuinely ambiguous, we recommend resolving N/A, especially if the ambiguity is the creator's fault.</li>
            <li>Moderators may intervene in cases of clear misconduct or violation of platform rules.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Abandoned Markets</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>If you've been inactive and your market has unambiguous resolution criteria, a moderator may resolve it on your behalf.</li>
            <li>See the Mod guidelines for the exact process of handling abandoned markets.</li>
            <li>Markets should not be left unresolved indefinitely.</li>
            <li>Creators are expected to monitor and resolve their markets in a timely manner.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Resolution Types</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li><strong>YES/NO:</strong> For binary outcomes where the event clearly occurred or didn't.</li>
            <li><strong>MULTIPLE CHOICE:</strong> Select the correct answer from predefined options.</li>
            <li><strong>N/A:</strong> Use when the market cannot be resolved due to ambiguity, cancellation, or other issues.</li>
            <li><strong>NUMERIC:</strong> For markets with numerical outcomes, resolve to the correct value.</li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}