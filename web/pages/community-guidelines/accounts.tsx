import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, LightningBoltIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import { SectionNav } from 'web/components/guidelines-sections'

export default function CommunityGuidelinesAccountsPage() {
  return (
    <Page
      trackPageView="community guidelines accounts page"
      className="!col-span-7"
    >
      <SEO
        title="Community Guidelines — Accounts & Market Manipulation"
        description="Account rules, alts, impersonation, market manipulation, and insider trading."
      />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/community-guidelines"
          className="text-ink-500 hover:text-primary-500 mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="text-primary-500 flex items-center gap-2">
          <LightningBoltIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Accounts & Market Manipulation</h1>
        </div>

        <p className="text-ink-600 mt-3 text-lg">
          Account rules, alts, impersonation, market manipulation, insider
          trading.
        </p>

        <GuidelinesSearch />

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="general-account-rules"
            className="text-ink-1000 text-xl font-semibold"
          >
            General account rules
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Impersonating another person, group, or organization may result in
              your username being changed.
            </li>
            <li>
              Usernames that violate our{' '}
              <a
                className="text-primary-500 underline"
                href="/community-guidelines/comment-guidelines"
              >
                Comment Guidelines
              </a>{' '}
              will be changed.
            </li>
            <li>
              NSFW profile pictures showing nudity or extreme violence will be
              replaced with a default image until you update it.
            </li>
            <li>Ban evasion will not be tolerated.</li>
            <li>
              Creating alts primarily to harvest bonuses, subsidies, or
              manipulate markets is not allowed.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="alt-accounts" className="text-ink-1000 text-xl font-semibold">
            Alt accounts
          </h2>
          <p className="text-ink-700 mt-3">
            Multiple accounts are allowed under specific conditions:
          </p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>
              For automated accounts, see the{' '}
              <a
                className="text-primary-500 underline"
                href="/community-guidelines/bots"
              >
                Bots
              </a>{' '}
              page — you can self-mark your account as a bot in profile settings
              rather than tagging Mods.
            </li>
            <li>
              One pseudonymous account is permitted for predictions you don't
              want tied to your main identity — it must not benefit your main
              account or deceive others.
            </li>
            <li>
              Any other alts must clearly indicate in the name or bio which
              account they're associated with, and must not benefit your main
              account in any way.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="market-manipulation"
            className="text-ink-1000 text-xl font-semibold"
          >
            Market manipulation
          </h2>
          <p className="text-ink-700 mt-3">
            The following will result in punishment regardless of whether you're
            otherwise following the rules. This applies to alts, friends'
            accounts, or any form of collusion:
          </p>
          <ul className="text-ink-700 mt-2 list-disc space-y-2 pl-5">
            <li>Using multiple accounts to abuse the unique trader bonus.</li>
            <li>
              Funneling mana to your main account via alts, referral or signup
              bonuses, or daily streaks.
            </li>
            <li>Using alts as fake identities to deceive other users.</li>
            <li>Creating accounts to manipulate market resolution.</li>
            <li>
              Coordinating trades across accounts to manipulate prices, odds, or
              leaderboard position.
            </li>
            <li>
              Exploiting Manifold bugs, breaking laws, or violating terms of
              service.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="insider-trading"
            className="text-ink-1000 text-xl font-semibold"
          >
            Insider trading
          </h2>
          <p className="text-ink-700 mt-3">
            Manifold actually encourages trading on private information — this
            is how markets get more accurate. As long as you didn't have a prior
            duty to keep that information private (to your employer, to the
            person who told you, or via a public commitment made on the market),
            you're welcome to trade on it. Caveat emptor.
          </p>
        </div>

        <SectionNav currentHref="/community-guidelines/accounts" />
      </Col>
    </Page>
  )
}
