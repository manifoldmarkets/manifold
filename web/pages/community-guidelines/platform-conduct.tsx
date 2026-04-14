import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { UsersIcon } from '@heroicons/react/outline'

export default function CommunityGuidelinesPlatformConductPage() {
  return (
    <Page trackPageView="community guidelines platform conduct page" className="!col-span-7">
      <SEO title="Community Guidelines — Platform Conduct" description="Platform conduct standards for Manifold users." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-primary-500">
          <UsersIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Platform Conduct</h1>
        </div>

        <p className="mt-3 text-lg text-ink-400">
          Keep Manifold a safe and sustainable place by avoiding spam, predatory behavior, and abusive content.
        </p>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">General conduct</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>No spammy direct messages or unsolicited promotions.</li>
            <li>Do not harass or target users with repetitive negative behavior.</li>
            <li>No predatory mana sales, bots, or third-party schemes to exploit the platform.</li>
            <li>Respect discussion norms and don’t derail conversations with low-effort content.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Content restrictions</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>No doxxing, illegal content, or actionable personal details.</li>
            <li>No hate speech, discrimination, extreme violence, or explicit content.</li>
            <li>Do not use the platform for misinformation or content that encourages harmful behavior.</li>
            <li>Follow all community and legal guidelines when sharing external links or information.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Moderation support</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Use reporting tools to flag policy-violating content.</li>
            <li>Contact support with context if you see repeated abuse.</li>
            <li>Moderators may take action for consistent or severe conduct violations.</li>
            <li>Approach disagreements respectfully and use the dispute channels.</li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}
