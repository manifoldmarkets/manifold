import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChatAlt2Icon } from '@heroicons/react/outline'

export default function CommunityGuidelinesCommentGuidelinesPage() {
  return (
    <Page trackPageView="community guidelines comment guidelines page" className="!col-span-7">
      <SEO title="Community Guidelines — Comment Guidelines" description="Rules for discussion and comments on Manifold markets." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-primary-500">
          <ChatAlt2Icon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Comment Guidelines</h1>
        </div>

        <p className="mt-3 text-lg text-ink-400">
          Manifold is a community-driven platform; comments should foster constructive discussion and avoid harassment.
        </p>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Respect and civility</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Be respectful: no insults, hate speech, or ad hominem attacks.</li>
            <li>Stay on-topic: keep comments relevant to the market content and resolution criteria.</li>
            <li>Disagree constructively and provide reasoning; avoid low-effort trolling.</li>
            <li>Keep the conversation safe for everyone in the community.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Prohibited content</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>No doxxing or sharing personal information about private individuals.</li>
            <li>No explicit content, harassment, or discriminatory language.</li>
            <li>No persistent low-quality comments, spam, or repeated one-word posts.</li>
            <li>Do not post content that violates platform policies or legal requirements.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Reporting and moderation</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Use hide/report tools for comments that violate guidelines.</li>
            <li>If you see a comment that should be moderated, report it with context and a link.</li>
            <li>Moderation decisions are intended to be minimal and transparent.</li>
            <li>Repeat offenders may be restricted or banned from commenting.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 className="text-xl font-semibold text-ink-900">Best practices</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Use strong evidence or logic in your comments; this improves market quality.</li>
            <li>Listen, learn, and adapt from community feedback.</li>
            <li>Treat disagreements as opportunities to refine predictions.</li>
          </ul>
        </div>
      </Col>
    </Page>
  )
}
