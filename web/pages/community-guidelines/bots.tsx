import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import { ChevronLeftIcon, ChipIcon, CogIcon } from '@heroicons/react/outline'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import { SectionNav } from 'web/components/guidelines-sections'

export default function CommunityGuidelinesBotsPage() {
  return (
    <Page
      trackPageView="community guidelines bots page"
      className="!col-span-7"
    >
      <SEO
        title="Community Guidelines — Bots"
        description="Rules for running bot accounts on Manifold: how to mark an account as a bot, what changes, and what's expected."
      />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/community-guidelines"
          className="text-ink-500 hover:text-primary-500 mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="text-primary-500 flex items-center gap-2">
          <ChipIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Bots</h1>
        </div>

        <p className="text-ink-600 mt-3 text-lg">
          Automated accounts are welcome on Manifold — they help keep markets
          liquid and well-calibrated. The rules below exist so bot activity is
          clearly labelled and doesn't crowd out humans in bonuses and leagues.
        </p>

        <GuidelinesSearch />

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="marking-an-account-as-a-bot"
            className="text-ink-1000 text-xl font-semibold"
          >
            Marking an account as a bot
          </h2>
          <p className="text-ink-700 mt-3">
            Open your profile, click the settings cog{' '}
            <CogIcon className="mb-0.5 inline h-4 w-4" />, scroll to{' '}
            <span className="font-medium">Account Settings</span> — the same
            page that shows your API key — and use the "mark account as bot"
            toggle.
          </p>
          <p className="text-ink-700 mt-3">
            <span className="font-bold">This action is permanent:</span> once
            you mark yourself as a bot, only a Moderator can reverse it. Only do
            this if your account is operated by an automated system (a trading
            bot, an API script, etc.), not a human.
          </p>
          <p className="text-ink-700 mt-3">
            In the bot account's bio, include the username of your human account
            so Mods and traders know who to contact if needed. If the bot is
            your only account, say that.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="what-changes-when-you-become-a-bot"
            className="text-ink-1000 text-xl font-semibold"
          >
            What changes when you become a bot
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              A "Bot" badge appears next to your name everywhere on the site.
            </li>
            <li>
              You'll be placed in the{' '}
              <Link
                href="/community-guidelines/leagues#silicon"
                className="text-primary-500 underline"
              >
                Silicon
              </Link>{' '}
              division at the start of the next season and compete only against
              other bots.
            </li>
            <li>
              Your bets don't count toward unique trader bonuses for market
              creators.
            </li>
            <li>
              You're excluded from importance score calculations, so your
              activity doesn't push markets up the homepage.
            </li>
            <li>You can't earn bettor bonuses for other users.</li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="separate-your-human-and-bot-accounts"
            className="text-ink-1000 text-xl font-semibold"
          >
            Separate your human and bot accounts
          </h2>
          <p className="text-ink-700 mt-3">
            We strongly encourage running automated trading from a dedicated bot
            account, not your primary one. If you run a bot on your primary
            account, the account may be treated as a bot — including reduction
            or removal of bonus eligibility.
          </p>
          <p className="text-ink-700 mt-3">
            See also{' '}
            <Link
              href="/community-guidelines/accounts#alt-accounts"
              className="text-primary-500 underline"
            >
              Alt Accounts
            </Link>{' '}
            for the rules on running multiple accounts in general.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="verification-and-prizes"
            className="text-ink-1000 text-xl font-semibold"
          >
            Verification and prizes
          </h2>
          <p className="text-ink-700 mt-3">
            Bot accounts don't need to complete identity verification. If your
            bot wins a Silicon league prize or earns mana you'd like to use,
            send it to your{' '}
            <a
              href="#verification-and-prizes"
              className="text-primary-500 underline"
            >
              Verified
            </a>{' '}
            main account via Managram and participate in{' '}
            <Link
              href="/community-guidelines/prize-drawings-faq"
              className="text-primary-500 underline"
            >
              Prize Drawings
            </Link>{' '}
            from there.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="transferring-mana"
            className="text-ink-1000 text-xl font-semibold"
          >
            Transferring mana to/from bot accounts
          </h2>
          <p className="text-ink-700 mt-3">
            You can send profit/balance to/from your main account, but you
            cannot exploit bonuses or manipulate markets or intentionally trade
            against yourself to launder profit.
          </p>
          <p className="text-ink-700 mt-3">
            This is the one sanctioned exception to the rule that{' '}
            <Link
              href="/community-guidelines/accounts#alt-accounts"
              className="text-primary-500 underline"
            >
              alts must not benefit your main account
            </Link>
            . The rule against funneling targets bonus harvesting (signup
            bonuses, daily streaks, unique trader bonuses), not transferring a
            bot's legitimately-earned mana for trading, prize drawings, or
            charity giveaways.
          </p>
        </div>

        <SectionNav currentHref="/community-guidelines/bots" />
      </Col>
    </Page>
  )
}
