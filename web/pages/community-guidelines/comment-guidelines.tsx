import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChatAlt2Icon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'

export default function CommunityGuidelinesCommentGuidelinesPage() {
  return (
    <Page trackPageView="community guidelines comment guidelines page" className="!col-span-7">
      <SEO title="Community Guidelines — Comment Guidelines" description="Rules for discussion and comments on Manifold markets." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2 text-primary-500">
          <ChatAlt2Icon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Comment Guidelines</h1>
        </div>

        <p className="mt-3 text-lg text-ink-600">
          Manifold supports open discussion. The following types of comments may be hidden, deleted, or result in a ban.
        </p>

        <GuidelinesSearch />

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="comment-hiding" className="text-xl font-semibold text-ink-1000">How comment hiding works</h2>
          <p className="mt-3 text-ink-700">Market creators can hide any comment on their own market at their discretion. Hidden comments remain publicly accessible behind a "comment hidden" message — they aren't deleted.</p>
          <p className="mt-3 text-ink-700">Moderators and admins can also hide or delete comments that violate these guidelines.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="whats-not-allowed" className="text-xl font-semibold text-ink-1000">What's not allowed</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Spam</li>
            <li>Hateful or discriminatory content directed at a person, group, or user</li>
            <li>Repeated harassment targeting another user</li>
            <li>Content that links to or contains material illegal under US law</li>
            <li>Doxxing — sharing or helping others find someone's private information</li>
            <li>Automated or bot comments that are low-effort, repetitive, or frequently reported may result in a mod alert or temporary posting ban. See <a className="text-primary-500 underline" href="/community-guidelines/moderation">Mod Guidelines</a> for how bans work.</li>
            <li>Promoting your own markets in the comments of unrelated markets — don't use other people's markets as a traffic source for your own.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="what-can-get-you-banned" className="text-xl font-semibold text-ink-1000">What can get you banned</h2>
          <p className="mt-3 text-ink-700">Any of the above can result in a restriction or ban depending on severity and history. Repeated violations are treated more harshly than first offenses.</p>
        </div>
      </Col>
    </Page>
  )
}
