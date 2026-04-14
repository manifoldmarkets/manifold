import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ShieldCheckIcon } from '@heroicons/react/outline'

export default function CommunityGuidelinesModerationGuidelinesPage() {
  return (
    <Page trackPageView="community guidelines moderation guidelines page" className="!col-span-7">
      <SEO title="Community Guidelines — Moderation Guidelines" description="Internal moderation guidelines for moderators." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-primary-500">
          <ShieldCheckIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Moderation Guidelines (internal)</h1>
        </div>

        <p className="mt-3 text-lg text-ink-400">
          This page is intended for moderators and internal staff. It covers standards for moderation actions, dispute resolution, and escalation.
        </p>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Moderation Principles</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Moderation should be minimal, transparent, and consistent with platform policy.</li>
            <li>Prioritize clear communication and explain decisions when possible.</li>
            <li>Document actions so other moderators can follow the history and rationale.</li>
            <li>Treat repeat offenses more severely, but escalate gradually for first-time issues.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Market Resolution</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Resolve abandoned markets when criteria are clear and creator is unresponsive.</li>
            <li>For ambiguous markets, prefer N/A and consult with team / senior moderators.</li>
            <li>Any re-resolution should include a summary of why it was changed and a link to discussion.</li>
            <li>Flag suspicious manipulation, insider trading, or coordinated activity to senior staff.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Handling Reports</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Review complete context before taking action (market, comments, history).</li>
            <li>Apply consistent consequences for harassment, doxxing, or policy violations.</li>
            <li>Escalate complex disputes to the moderation lead with full evidence and proposed outcome.</li>
            <li>Keep user interactions professional in all responses.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Escalation and Appeals</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Offer users a path to appeal decisions, with clear steps and expected response times.</li>
            <li>Focus on education where possible; use bans only when necessary.</li>
            <li>Share lessons learned with the moderation team after complex cases.</li>
            <li>Update the public guidelines if new edge cases or consistent behavior patterns emerge.</li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}
