import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { LightningBoltIcon, UsersIcon, ShieldCheckIcon, CheckCircleIcon, CollectionIcon, ChatAlt2Icon } from '@heroicons/react/outline'

const GUIDELINES = [
  'Be excellent to each other.',
  "Don't exploit bonuses, bugs, or loopholes — especially on your own markets.",
  'Resolve honestly and promptly.',
  'Report security issues privately to a dev.',
  'These are guidelines, not a contract. Act in good faith, not just within the letter of the rules.',
]

const SECTIONS = [
  {
    title: 'Accounts & Market Manipulation',
    description:
      'No alt accounts, impersonation, collusion, front-running, or insider trading. Keep each account honest and fair.',
    icon: LightningBoltIcon,
  },
  {
    title: 'Running a Market',
    description:
      'Follow the ban list, label rankings correctly, and play by the market rules. Personal markets must be clearly declared.',
    icon: CollectionIcon,
  },
  {
    title: 'Resolving Markets',
    description:
      'Creators should resolve markets fairly, with clear reasoning. Avoid leaving abandoned markets unresolved and update your dispute details promptly.',
    icon: CheckCircleIcon,
  },
  {
    title: 'Comment Guidelines',
    description:
      'No harassment, doxxing, repeated low-quality comments, or safety violations. Use hiding and reporting tools responsibly.',
    icon: ChatAlt2Icon,
  },
  {
    title: 'Platform Conduct',
    description:
      'No spammy DMs, predatory mana sales, or abusive content. Respect our community and platform space.',
    icon: UsersIcon,
  },
  {
    title: 'Moderation',
    description:
      'Moderation is minimal and transparent. If you disagree with a moderation decision, contact support and provide clear context.',
    icon: ShieldCheckIcon,
  },
]

export default function CommunityGuidelinesPage() {
  return (
    <Page trackPageView="community guidelines page" className="!col-span-7">
      <SEO title="Community Guidelines" description="Manifold community guidelines to keep the market fair and fun." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-4xl font-bold text-primary-500">Community Guidelines</h1>
        <p className="mt-3 text-lg text-slate-400">
          Manifold keeps moderation minimal and trusts you to act in good faith. These guidelines protect the quality of the platform,
          not micromanage it.
        </p>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-ink-900">Short Version</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-700">
            {GUIDELINES.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-primary-500" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {SECTIONS.map((item) => {
            const linkMap: Record<string, string | undefined> = {
              'Accounts & Market Manipulation': '/community-guidelines/accounts',
              'Running a Market': '/community-guidelines/running-a-market',
              'Resolving Markets': '/community-guidelines/resolving-markets',
              'Comment Guidelines': '/community-guidelines/comment-guidelines',
              'Platform Conduct': '/community-guidelines/platform-conduct',
              'Moderation': '/community-guidelines/moderation',
            }
            const href = linkMap[item.title]

            const cardBody = (
              <>
                <div className="flex items-center gap-2">
                  <item.icon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-ink-900">{item.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink-700">{item.description}</p>
              </>
            )

            if (href) {
              return (
                <Link
                  key={item.title}
                  href={href}
                  className="block rounded-xl border-2 border-ink-200 bg-canvas-0 p-5 shadow-sm transition hover:border-primary-300"
                >
                  {cardBody}
                </Link>
              )
            }

            return (
              <div
                key={item.title}
                className="rounded-xl border-2 border-ink-200 bg-canvas-0 p-5 shadow-sm transition hover:border-primary-300"
              >
                {cardBody}
              </div>
            )
          })}
        </div>

        <div className="mt-8 rounded-xl border-2 border-ink-200 bg-canvas-50 p-5">
          <h2 className="text-lg font-semibold text-ink-900">Note</h2>
          <p className="mt-2 text-sm text-ink-700">
            These are guidelines, not rules. They don't cover every situation and aren't ironclad. Good participation means understanding the spirit of these norms, not just the letter.
            You may face consequences for behaviour that goes against the general expectation even if it's not explicitly listed.
          </p>
          <p className="mt-6 text-sm text-ink-700">
            Questions or need to report something? Reach us on <a className="text-primary-500 underline" href="https://discord.gg/2sHu6z9WMQ" target="_blank" rel="noreferrer">Discord</a> or email <a className="text-primary-500 underline" href="mailto:info@manifold.markets">info@manifold.markets</a>. For moderation questions, see the Mod guidelines page.
          </p>
        </div>
      </Col>
    </Page>
  )
}
