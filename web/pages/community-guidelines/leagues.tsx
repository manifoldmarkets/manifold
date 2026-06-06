import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import clsx from 'clsx'
import {
  ChartBarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/outline'
import { DIVISION_NAMES } from 'common/leagues'
import { GuidelinesSearch } from 'web/components/guidelines-search'
import { SectionNav } from 'web/components/guidelines-sections'
import { DIVISION_STYLES } from 'web/components/leagues/division-badge'

const DIVISION_ICONS: Record<number, string> = {
  0: '🤖',
  1: '🥉',
  2: '🥈',
  3: '🥇',
  4: '💿',
  5: '💎',
  6: '🎖️',
}

const DIVISION_MOVEMENT: { name: string; demote: string; promote: string }[] = [
  { name: 'Silicon', demote: '—', promote: 'Bots only — stays in Silicon' },
  {
    name: 'Bronze',
    demote: 'No demotion',
    promote: '10 promote (top 2 skip a division)',
  },
  {
    name: 'Silver',
    demote: '5 demote',
    promote: '7 promote (top 1 skips a division)',
  },
  { name: 'Gold', demote: '6 demote', promote: '6 promote' },
  { name: 'Platinum', demote: '10 demote', promote: '5 promote' },
  { name: 'Diamond', demote: '10 demote', promote: '2 promote' },
  {
    name: 'Masters',
    demote: '~60% demote',
    promote: 'Top division — nowhere higher to go',
  },
]

export default function CommunityGuidelinesLeaguesPage() {
  return (
    <Page
      trackPageView="community guidelines leagues page"
      className="!col-span-7"
    >
      <SEO
        title="Community Guidelines — Leagues"
        description="How Manifold leagues work, how scoring is calculated, and rules around prize eligibility."
      />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link
          href="/community-guidelines"
          className="text-ink-500 hover:text-primary-500 mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="text-primary-500 flex items-center gap-2">
          <ChartBarIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Leagues</h1>
        </div>

        <p className="text-ink-600 mt-3 text-lg">
          Leagues are Manifold's monthly competitive ladder. You're sorted into
          a division at the start of each season, and your profit on ranked
          markets determines your rank — and your prize.
        </p>

        <GuidelinesSearch />

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="what-counts" className="text-ink-1000 text-xl font-semibold">
            What counts toward your score
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Only profit on{' '}
              <Link
                href="/community-guidelines/market-policies#ranked"
                className="text-primary-500 underline"
              >
                Ranked Markets
              </Link>{' '}
              counts. You can often tell if a market is ranked by seeing if it
              has the "Unranked" topic tag. To be certain, click the three dots
              menu (…) on a market page and select "see info" to view the ranked
              status.
            </li>
            <li>
              Unique trader bonuses earned on ranked markets you've created also
              count toward your score.
            </li>
            <li>
              Bets on your own markets within the first hour of creation don't
              count toward your league score — this prevents creators from
              pump-and-dumping fresh markets for league points.
            </li>
          </ul>
        </div>

        <div className="border-ink-200 border-l-primary-500 bg-canvas-0 mt-6 rounded-xl border-2 border-l-4 p-6 shadow-sm">
          <h2 id="divisions" className="text-ink-1000 text-xl font-semibold">
            Divisions and movement
          </h2>
          <p className="text-ink-700 mt-3">
            Six promotable divisions ranging from Bronze to Masters. The{' '}
            <span id="silicon" className="font-medium">
              Silicon
            </span>{' '}
            division is for bots only. New human accounts start in Bronze. At
            the end of each season your final rank in your division decides
            whether you promote up, stay put, or demote down for next month.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {[0, 1, 2, 3, 4, 5, 6].map((d, i) => {
              const style = DIVISION_STYLES[d]
              return (
                <div key={d} className="flex items-center gap-2 sm:gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={clsx(
                        'flex h-12 w-12 items-center justify-center rounded-lg border text-xl shadow-sm',
                        style.bg,
                        style.border
                      )}
                    >
                      {DIVISION_ICONS[d]}
                    </div>
                    <span className={clsx('text-xs font-medium', style.text)}>
                      {DIVISION_NAMES[d]}
                    </span>
                  </div>
                  {i > 0 && i < 6 && (
                    <ChevronRightIcon className="text-ink-400 hidden h-4 w-4 shrink-0 sm:block" />
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="text-ink-700 w-full text-sm">
              <thead>
                <tr className="border-ink-200 border-b">
                  <th className="text-ink-1000 pb-2 pr-4 text-left font-semibold">
                    Division
                  </th>
                  <th className="text-ink-1000 pb-2 pr-4 text-left font-semibold">
                    Demotion
                  </th>
                  <th className="text-ink-1000 pb-2 text-left font-semibold">
                    Promotion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y">
                {DIVISION_MOVEMENT.map((row) => (
                  <tr key={row.name}>
                    <td className="py-2 pr-4 font-medium">{row.name}</td>
                    <td className="py-2 pr-4">{row.demote}</td>
                    <td className="py-2">{row.promote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-ink-700 mt-4">
            <span className="font-medium">Double promotion</span> means skipping
            a division entirely — a stellar run in Bronze can land you in Gold
            next season.{' '}
            <span className="font-medium">Masters auto-demotes around 60%</span>{' '}
            of its cohort each month so the top division stays competitive even
            though there's no higher rung to promote into.
          </p>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2 id="prizes" className="text-ink-1000 text-xl font-semibold">
            Prizes
          </h2>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Each group in each division pays prizes to its top ranks at season
              end. The exact amounts are shown in the prizes modal on the{' '}
              <Link href="/leagues" className="text-primary-500 underline">
                Leagues
              </Link>{' '}
              page.
            </li>
            <li>
              Receiving a prize requires identity verification (KYC). Bots in
              the Silicon division are exempt but must have earned at least 100
              mana to qualify.
            </li>
            <li>Each user receives at most one prize per season.</li>
          </ul>
        </div>

        <div className="border-ink-200 bg-canvas-0 mt-6 rounded-xl border-2 p-6">
          <h2
            id="prize-forfeiture"
            className="text-ink-1000 text-xl font-semibold"
          >
            What gets your prize pulled
          </h2>
          <p className="text-ink-700 mt-3">
            The following will result in your league prize being withheld,
            reduced, or recalled — even after it's been awarded:
          </p>
          <ul className="text-ink-700 mt-3 list-disc space-y-2 pl-5">
            <li>
              Manipulating markets, misresolving, or otherwise breaking the{' '}
              <Link
                href="/community-guidelines"
                className="text-primary-500 underline"
              >
                Community Guidelines
              </Link>{' '}
              specifically to gain a leagues advantage.
            </li>
            <li>
              Refunding counterparties to extract a leagues result — for
              example, two users trading M100k on opposite sides of a 50/50
              market, and the winner refunding the loser after collecting their
              league prize. Markets used this way may be unranked retroactively,
              and the prize may be recalled.
            </li>
            <li>
              Coordinating trades across accounts or with friends to inflate
              your score (see{' '}
              <Link
                href="/community-guidelines/accounts#market-manipulation"
                className="text-primary-500 underline"
              >
                Market Manipulation
              </Link>
              ).
            </li>
            <li>
              Any violation of the rules on{' '}
              <Link
                href="/community-guidelines/accounts"
                className="text-primary-500 underline"
              >
                Alts
              </Link>{' '}
              or{' '}
              <Link
                href="/community-guidelines/bots"
                className="text-primary-500 underline"
              >
                Bot Accounts
              </Link>{' '}
              applied to league play.
            </li>
          </ul>
        </div>

        <SectionNav currentHref="/community-guidelines/leagues" />
      </Col>
    </Page>
  )
}
