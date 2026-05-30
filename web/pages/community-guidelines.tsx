import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import {
  LightningBoltIcon,
  UsersIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ScaleIcon,
  ChatAlt2Icon,
  GiftIcon,
  ChipIcon,
  ChartBarIcon,
  DocumentTextIcon,
} from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'

const GUIDELINES = [
  'Be excellent to each other.',
  "Don't exploit bonuses, bugs, or loopholes — especially on your own markets.",
  'Resolve honestly and promptly.',
  "Report bugs in #bugs on Discord. Report security issues or exploits privately to info@manifold.markets — don't act on them first.",
  'These are guidelines, not a contract. Act in good faith, not just within the letter of the rules.',
]

const SECTIONS = [
  {
    title: 'Platform Conduct',
    description:
      'Mana sales, DM spam, review conduct, and other platform-wide rules.',
    icon: UsersIcon,
    href: '/community-guidelines/platform-conduct',
  },
  {
    title: 'Accounts & Market Manipulation',
    description:
      'Account rules, alts, impersonation, market manipulation, insider trading.',
    icon: LightningBoltIcon,
    href: '/community-guidelines/accounts',
  },
  {
    title: 'Running a Market',
    description:
      "What's banned, ranked vs unranked, creator expectations, personal markets.",
    icon: ScaleIcon,
    href: '/community-guidelines/running-a-market',
  },
  {
    title: 'Resolving Markets',
    description: 'Creator resolution, mod intervention, abandoned markets.',
    icon: CheckCircleIcon,
    href: '/community-guidelines/resolving-markets',
  },
  {
    title: 'Market Policies',
    description:
      'Market states, ranking, subsidization, unlisting criteria, and personal markets.',
    icon: DocumentTextIcon,
    href: '/community-guidelines/market-policies',
  },
  {
    title: 'Comment Guidelines',
    description:
      "What's not allowed, how hiding works, what can get you banned.",
    icon: ChatAlt2Icon,
    href: '/community-guidelines/comment-guidelines',
  },
  {
    title: 'Leagues',
    description:
      'Scoring, divisions, prizes, and what can get your league prize pulled.',
    icon: ChartBarIcon,
    href: '/community-guidelines/leagues',
  },
  {
    title: 'Bots',
    description:
      'How to mark an account as a bot, what changes, and rules for automated traders.',
    icon: ChipIcon,
    href: '/community-guidelines/bots',
  },
  {
    title: 'Moderation',
    description:
      'How moderation works, who mods are, and what to do if you disagree with a decision.',
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
      <SEO
        title="Community Guidelines"
        description="Manifold community guidelines to keep the market fair and fun."
      />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-primary-500 text-4xl font-bold">
          Community Guidelines
        </h1>
        <p className="text-ink-600 mt-3 text-lg">
          Manifold keeps moderation minimal and trusts you to act in good faith.
          These guidelines protect the quality of the platform, not micromanage
          it.
        </p>
        <p className="text-ink-600 mt-1 text-sm">Last updated: May 2026</p>

        <GuidelinesSearch />

        <div className="border-ink-200 border-l-primary-500 bg-canvas-0 mt-6 rounded-xl border-2 border-l-4 p-5 shadow-sm">
          <h2
            id="short-version"
            className="text-ink-1000 text-xl font-semibold"
          >
            Short Version
          </h2>
          <ul className="text-ink-700 mt-3 space-y-2 text-sm">
            {GUIDELINES.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="bg-primary-500 mt-1 inline-flex h-2 w-2 rounded-full" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {SECTIONS.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="border-ink-200 bg-canvas-0 hover:border-primary-300 block rounded-xl border-2 p-5 shadow-sm transition"
            >
              <div className="flex items-center gap-2">
                <item.icon className="text-primary-500 h-5 w-5" />
                <h3 className="text-ink-1000 text-lg font-semibold">
                  {item.title}
                </h3>
              </div>
              <p className="text-ink-700 mt-2 text-sm leading-6">
                {item.description}
              </p>
            </Link>
          ))}
        </div>

        <div className="border-ink-200 bg-canvas-50 mt-8 rounded-xl border-2 p-5">
          <h2 className="text-ink-1000 text-lg font-semibold">Note</h2>
          <p className="text-ink-700 mt-2 text-sm">
            These are guidelines, not rules. They don't cover every situation
            and aren't ironclad. Good participation means understanding the
            spirit of these norms, not just the letter. You may face
            consequences for behaviour that goes against the general expectation
            even if it's not explicitly listed.
          </p>
          <p className="text-ink-700 mt-6 text-sm">
            Questions or need to report something? Reach us on{' '}
            <a
              className="text-primary-500 underline"
              href="https://discord.gg/2sHu6z9WMQ"
              target="_blank"
              rel="noreferrer"
            >
              Discord
            </a>{' '}
            or email{' '}
            <a
              className="text-primary-500 underline"
              href="mailto:info@manifold.markets"
            >
              info@manifold.markets
            </a>
            . For moderation questions, see the{' '}
            <Link
              className="text-primary-500 underline"
              href="/community-guidelines/moderation"
            >
              Moderation
            </Link>{' '}
            page.
          </p>
        </div>
      </Col>
    </Page>
  )
}
