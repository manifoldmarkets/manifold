import Link from 'next/link'
import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { SEO } from 'web/components/SEO'
import clsx from 'clsx'
import { ChartBarIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/outline'
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
  { name: 'Bronze', demote: 'No demotion', promote: '10 promote (top 2 skip a division)' },
  { name: 'Silver', demote: '5 demote', promote: '7 promote (top 1 skips a division)' },
  { name: 'Gold', demote: '6 demote', promote: '6 promote' },
  { name: 'Platinum', demote: '10 demote', promote: '5 promote' },
  { name: 'Diamond', demote: '10 demote', promote: '2 promote' },
  { name: 'Masters', demote: '~60% demote', promote: 'Top division — nowhere higher to go' },
]

export default function CommunityGuidelinesLeaguesPage() {
  return (
    <Page trackPageView="community guidelines leagues page" className="!col-span-7">
      <SEO title="Community Guidelines — Leagues" description="How Manifold leagues work, how scoring is calculated, and rules around prize eligibility." />
      <Col className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link href="/community-guidelines" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-primary-500">
          <ChevronLeftIcon className="h-4 w-4" /> Community Guidelines
        </Link>
        <div className="flex items-center gap-2 text-primary-500">
          <ChartBarIcon className="h-6 w-6" />
          <h1 className="text-4xl font-bold">Leagues</h1>
        </div>

        <p className="mt-3 text-lg text-ink-600">
          Leagues are Manifold's monthly competitive ladder. You're sorted into a division at the start of each season, and your profit on ranked markets determines your rank — and your prize.
        </p>

        <GuidelinesSearch />

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="what-counts" className="text-xl font-semibold text-ink-1000">What counts toward your score</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Only profit on <Link href="/community-guidelines/running-a-market#ranked" className="text-primary-500 underline">ranked markets</Link> counts. You can often tell if a market is ranked by seeing if it has the "Unranked" topic tag. To be certain, go to options → "See info" on a market page and it will display the ranked status.</li>
            <li>Bets on your own markets count only after a 1-hour delay — this prevents creators from pump-and-dumping fresh markets for league points.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 border-l-4 border-l-primary-500 bg-canvas-0 p-6 shadow-sm">
          <h2 id="divisions" className="text-xl font-semibold text-ink-1000">Divisions and movement</h2>
          <p className="mt-3 text-ink-700">Seven divisions, from <span id="silicon" className="font-medium">Silicon</span> (bots only) at the bottom to Masters at the top. New human accounts start in Bronze. At the end of each season your final rank in your division decides whether you promote up, stay put, or demote down.</p>

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
                  {i < 6 && (
                    <ChevronRightIcon className="hidden h-4 w-4 shrink-0 text-ink-400 sm:block" />
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm text-ink-700">
              <thead>
                <tr className="border-b border-ink-200">
                  <th className="pb-2 pr-4 text-left font-semibold text-ink-1000">Division</th>
                  <th className="pb-2 pr-4 text-left font-semibold text-ink-1000">Demotion</th>
                  <th className="pb-2 text-left font-semibold text-ink-1000">Promotion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
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

          <p className="mt-4 text-ink-700"><span className="font-medium">Double promotion</span> means skipping a division entirely — a stellar run in Bronze can land you in Gold next season. <span className="font-medium">Masters auto-demotes around 60%</span> of its cohort each month so the top division stays competitive even though there's no higher rung to promote into.</p>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="prizes" className="text-xl font-semibold text-ink-1000">Prizes</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Each division pays prizes to its top ranks at season end. The exact amounts are shown in the prizes modal on the <Link href="/leagues" className="text-primary-500 underline">Leagues page</Link>.</li>
            <li>Receiving a prize requires identity verification (KYC). Bots in the Silicon division are exempt but must have earned at least 100 mana to qualify.</li>
            <li>Each user receives at most one prize per season.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-0 p-6">
          <h2 id="prize-forfeiture" className="text-xl font-semibold text-ink-1000">What gets your prize pulled</h2>
          <p className="mt-3 text-ink-700">The following will result in your league prize being withheld, reduced, or recalled — even after it's been awarded:</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-700">
            <li>Manipulating markets, misresolving, or otherwise breaking the <Link href="/community-guidelines" className="text-primary-500 underline">Community Guidelines</Link> specifically to gain a leagues advantage.</li>
            <li>Refunding counterparties to extract a leagues result — for example, two users trading M100k on opposite sides of a 50/50 market, and the winner refunding the loser after collecting their league prize. Markets used this way may be unranked retroactively, and the prize may be recalled.</li>
            <li>Coordinating trades across accounts or with friends to inflate your score (see <Link href="/community-guidelines/accounts#market-manipulation" className="text-primary-500 underline">Market manipulation</Link>).</li>
            <li>Any violation of the rules on <Link href="/community-guidelines/accounts" className="text-primary-500 underline">alts</Link> or <Link href="/community-guidelines/bots" className="text-primary-500 underline">bot accounts</Link> applied to league play.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-xl border-2 border-ink-200 bg-canvas-50 p-5">
          <p className="text-sm text-ink-700">
            Leagues are meant to reward being good at predicting, not at extracting. If you're not sure whether a strategy crosses the line, ask in <a className="text-primary-500 underline" href="https://discord.gg/2sHu6z9WMQ" target="_blank" rel="noreferrer">Discord</a> before running it.
          </p>
        </div>

        <SectionNav currentHref="/community-guidelines/leagues" />
      </Col>
    </Page>
  )
}
