import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ShieldCheckIcon } from '@heroicons/react/outline'

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
          Moderation is meant to protect community trust and enforce guidelines fairly.
        </p>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Transparency and process</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Moderators act minimally and publicly outline decisions where possible.</li>
            <li>Moderation is intended to be consistent and rooted in community guidelines.</li>
            <li>Moderators may resolve or re-resolve markets if rules are breached or ambiguity is unresolved.</li>
            <li>Users can ask for reconsideration or clarification through support channels.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">When moderation happens</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>For unambiguous abandoned markets, moderators may resolve on the creator's behalf.</li>
            <li>Fraudulent market activity or abuse may lead to immediate moderator action.</li>
            <li>Content or account violations may provoke comment/messaging restrictions or bans.</li>
            <li>Repeated policy violations can escalate to temporary or permanent suspensions.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Appeals and support</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>If you disagree with a decision, provide context and request review via support.</li>
            <li>Tag @mods in market dispute threads to request market re-resolution.</li>
            <li>Manifold may revise policies when needed to improve fairness.</li>
            <li>Moderation is not a punishment first, but a community safety measure.</li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}
