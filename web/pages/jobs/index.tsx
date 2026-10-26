import {
  ArrowRightIcon,
  BriefcaseIcon,
  ExternalLinkIcon,
} from '@heroicons/react/outline'
import { useState } from 'react'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { JobInterestCard } from 'web/components/jobs/job-interest-card'
import { JobCard } from 'web/components/jobs/job-card'
import { AppliedNudge, ApplyLink } from 'web/components/jobs/apply-link'
import {
  type Job,
  MNX,
  UPSTART,
  UPSTART_JOBS,
  UPSTART_EMAIL,
  UPSTART_APPLY_URL,
} from 'web/lib/jobs'

// MNX job data lives here; Upstart listings live in web/lib/jobs.ts.
// To add, edit, or remove a listing, change its array
// and open a PR — there is intentionally no database or employer-facing editor.
// Employers email us to list a role or tell us when one is filled.
const JOBS: Job[] = [
  {
    title: 'Backend Engineer',
    location: 'San Francisco',
    comp: 'Base + equity',
    blurb:
      'Build the high-performance backend infra that turns onchain contracts into a real trading platform.',
    intro:
      'Build high performance exchange infra. Most of your work is backend: the ' +
      'services, pipelines, and infrastructure that turn onchain contracts into a ' +
      "real trading platform, but you'll reach across the stack wherever the product " +
      'needs you.',
    whatYoullDo: [
      'Build and operate the backend services behind the exchange: APIs, market data, order/position state, and the systems that sit between the protocol and the UI',
      'Own key exchange infrastructure: data pipelines from oracles and price feeds, indexing onchain events, monitoring, and deploys',
      'Take on the broad platform tasks a small team generates — internal tooling, integrations, performance, and reliability',
      'Help set engineering practices and own features end to end, from design through production',
    ],
    whatWereLookingFor: [
      'A strong generalist engineer with solid backend chops — building reliable services and data systems in production',
      'Comfortable across the stack and happy to context-switch; you reach for the right tool rather than the familiar one',
      "Some Solidity or EVM exposure is a real plus — enough to read contracts and contribute, even if it isn't your core",
      'Bonus: experience with trading systems, real-time data, or crypto infra',
    ],
    contactEmail: 'dev@mnx.fi',
  },
  {
    title: 'Quantitative Trader',
    location: 'San Francisco',
    comp: 'Base + equity + carry',
    blurb:
      'Run the liquidity vault and make markets across novel, illiquid instruments — high-ownership and performance-based.',
    intro:
      "As part of the trading team, you'll help run the liquidity vault and make " +
      'markets across our full market catalog, from private-lab valuations, H100 ' +
      "prices, equity perps, etc. You'll set quotes, manage inventory and funding, " +
      'and keep the book deep enough for serious size. Much of this is novel and ' +
      "illiquid; you'll be pricing instruments that have never had a market before. " +
      'This is a high-ownership seat at the center of how the exchange actually ' +
      'trades with a heavily performance-based comp structure.',
    whatYoullDo: [
      'Manage the protocol liquidity vault',
      'Make markets across the catalog: quote, hedge, and manage funding rates on perps and event markets',
      'Build pricing and risk models for thin, novel underlyings where no clean reference market exists',
      'Own risk: position limits, exposure, liquidations, and the behavior of the book under stress',
      'Partner with engineering on vault mechanics, oracle inputs, and settlement; with growth on which markets to list next',
    ],
    whatWereLookingFor: [
      'Market-making or quant-trading experience: crypto perps, TradFi derivatives, or both',
      'Comfort pricing illiquid and unusual instruments, and sizing risk under genuine uncertainty',
      'Sharp risk discipline and a calm hand when markets move',
      'Bonus: onchain trading experience, automated MM systems, or a research background in derivatives pricing',
    ],
    contactEmail: 'gamma@mnx.fi',
  },
]

export default function JobsPage() {
  const [appliedToUpstart, setAppliedToUpstart] = useState(false)
  return (
    <Page trackPageView="/jobs" className="!col-span-7">
      <SEO
        title="Job Board"
        description="Curated jobs by employers who value forecasting."
        url="/jobs"
      />
      <Col className="mx-auto w-full max-w-3xl gap-10 p-4">
        <header className="border-ink-200 border-b pb-8 dark:border-slate-700/70 sm:pb-10">
          <h1 className="text-ink-900 max-w-2xl text-4xl font-semibold leading-tight tracking-tight dark:text-slate-100 sm:text-5xl">
            Manifold Job Board
          </h1>
          <p className="text-primary-600 mt-3 text-xl font-medium dark:text-indigo-300 sm:text-2xl">
            Put your foresight to work
          </p>
          <p className="text-ink-600 mt-3 max-w-xl text-base leading-relaxed dark:text-slate-300 sm:text-lg">
            Opportunities for people who think in probabilities. Find your next
            role with employers who value forecasting.
          </p>
        </header>

        <div className="flex flex-col gap-10">
          <section aria-labelledby="open-roles-heading" className="min-w-0">
            <Row className="mb-5 items-center gap-2.5">
              <h2
                id="open-roles-heading"
                className="text-ink-900 text-lg font-semibold dark:text-slate-100"
              >
                Open roles
              </h2>
              <span className="bg-ink-100 text-ink-600 rounded-full px-2.5 py-0.5 text-xs font-semibold dark:bg-slate-700/50 dark:text-slate-300">
                {JOBS.length + UPSTART_JOBS.length}
              </span>
            </Row>

            {UPSTART_JOBS.length > 0 && (
              <section aria-labelledby="upstart-heading" className="mb-10">
                <div className="mb-5">
                  <h3
                    id="upstart-heading"
                    className="text-ink-900 text-xl font-semibold dark:text-slate-100"
                  >
                    Upstart
                  </h3>
                  <p className="text-ink-600 mt-3 text-sm leading-relaxed dark:text-slate-300">
                    Apply broadly for any/all suitable roles by emailing your
                    resume to Joe Orsini at{' '}
                    <ApplyLink
                      href={UPSTART_APPLY_URL}
                      employer={UPSTART}
                      onApply={() => setAppliedToUpstart(true)}
                      className="text-primary-600 focus-visible:ring-primary-500 break-all rounded underline focus:outline-none focus-visible:ring-2 dark:text-indigo-300"
                    >
                      {UPSTART_EMAIL}
                    </ApplyLink>
                    . You do not need to choose a role. Mention that you found
                    Upstart on Manifold.
                  </p>
                  <p className="text-ink-500 mt-2 text-sm dark:text-slate-400">
                    The email link opens a draft. Attach your resume before
                    sending.
                  </p>
                  <ApplyLink
                    href={UPSTART_APPLY_URL}
                    employer={UPSTART}
                    onApply={() => setAppliedToUpstart(true)}
                    className="bg-primary-600 hover:bg-primary-700 focus-visible:ring-primary-500 mt-4 inline-flex rounded-lg px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    Apply to Upstart by email
                  </ApplyLink>
                  {appliedToUpstart && (
                    <AppliedNudge employer={UPSTART} className="mt-4" />
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  {UPSTART_JOBS.map((job) => (
                    <JobCard key={job.sourceUrl} job={job} employer={UPSTART} />
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="mnx-heading">
              <div className="mb-5">
                <Row className="items-center gap-3">
                  <div
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 dark:ring-1 dark:ring-slate-700"
                  >
                    <img
                      src="/mnx-logo.svg"
                      alt=""
                      width={300}
                      height={103}
                      className="h-auto w-10"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3
                      id="mnx-heading"
                      className="text-ink-900 font-semibold dark:text-slate-100"
                    >
                      MNX{' '}
                      <span className="text-ink-500 font-normal dark:text-slate-400">
                        / The AI Exchange
                      </span>
                    </h3>
                    <a
                      href="https://mnx.fi"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Visit the MNX website"
                      className="text-ink-500 hover:text-primary-600 mt-0.5 inline-flex items-center gap-1 rounded text-sm dark:text-slate-400 dark:hover:text-indigo-200"
                    >
                      mnx.fi{' '}
                      <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </div>
                </Row>
                <p className="text-ink-600 mt-4 text-sm leading-relaxed dark:text-slate-300">
                  Building the financial architecture for the AI era. A small,
                  ambitious team in San Francisco, working at the intersection
                  of AI, trading, and crypto.
                </p>
              </div>
              <div className="flex flex-col gap-4">
                {JOBS.map((job) => (
                  <JobCard key={job.title} job={job} employer={MNX} />
                ))}
              </div>
            </section>
            <p className="text-ink-500 mt-5 text-center text-xs dark:text-slate-400">
              Curated for the Manifold community. Apply directly with the team.
            </p>
          </section>

          <aside
            id="job-interest"
            aria-label="For job seekers and employers"
            className="border-ink-200 grid min-w-0 gap-5 border-t pt-8 dark:border-slate-700/70 md:grid-cols-2"
          >
            <JobInterestCard />
            <div className="border-ink-200 bg-canvas-0 flex flex-col rounded-2xl border p-5 dark:border-slate-700/70 dark:bg-slate-800/60">
              <div className="bg-ink-100 text-ink-600 mb-4 flex h-10 w-10 items-center justify-center rounded-xl dark:bg-slate-700/50 dark:text-slate-300">
                <BriefcaseIcon className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="text-ink-900 text-base font-semibold dark:text-slate-100">
                Find your next great hire.
              </h2>
              <p className="text-ink-600 mt-2 text-sm leading-relaxed dark:text-slate-300">
                Hiring in trading, AI, or fintech? Reach a community of curious,
                analytical thinkers.
              </p>
              <div className="mt-auto pt-5">
                <a
                  href="mailto:info@manifold.markets"
                  className="border-primary-200 text-primary-600 hover:bg-primary-50 focus-visible:ring-primary-500 inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:border-indigo-400/30 dark:text-indigo-300 dark:hover:bg-indigo-400/10 dark:focus-visible:ring-offset-slate-900"
                >
                  Post a role <ArrowRightIcon className="h-4 w-4" aria-hidden />
                </a>
              </div>
            </div>
          </aside>
        </div>
      </Col>
    </Page>
  )
}
