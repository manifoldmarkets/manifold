import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { LightningBoltIcon, UsersIcon, ShieldCheckIcon, CheckCircleIcon, CollectionIcon, ChatAlt2Icon, GiftIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'

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
    description: 'Account rules, alts, impersonation, market manipulation, insider trading.',
    icon: LightningBoltIcon,
    href: '/community-guidelines/accounts',
  },
  {
    title: 'Running a Market',
    description: "What's banned, ranked vs unranked, subsidies, creator expectations, personal markets.",
    icon: CollectionIcon,
    href: '/community-guidelines/running-a-market',
  },
  {
    title: 'Resolving Markets',
    description: 'Creator resolution, mod intervention, abandoned markets.',
    icon: CheckCircleIcon,
    href: '/community-guidelines/resolving-markets',
  },
  {
    title: 'Comment Guidelines',
    description: "What's not allowed, how hiding works, what can get you banned.",
    icon: ChatAlt2Icon,
    href: '/community-guidelines/comment-guidelines',
  },
  {
    title: 'Platform Conduct',
    description: 'Mana sales, DM spam, review conduct, and other platform-wide rules.',
    icon: UsersIcon,
    href: '/community-guidelines/platform-conduct',
  },
  {
    title: 'Moderation',
    description: 'How moderation works, who mods are, and what to do if you disagree with a decision.',
    icon: ShieldCheckIcon,
    href: '/community-guidelines/moderation',
  },
  {
    title: 'Prize Drawings',
    description: 'FAQs for Manifold Prize Drawings',
    icon: GiftIcon,
    href: '/community-guidelines/prize-drawings-faq',
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

        <GuidelinesSearch />

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-5 shadow-sm">
          <h2 id="short-version" className="text-xl font-semibold text-ink-900">Short Version</h2>
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
            const cardBody = (
              <>
                <div className="flex items-center gap-2">
                  <item.icon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-ink-900">{item.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink-700">{item.description}</p>
              </>
            )

            if (item.href) {
              return (
                <Link
                  key={item.title}
                  href={item.href}
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
