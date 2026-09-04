import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { ExternalLinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useId, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { BackButton } from 'web/components/contract/back-button'
import { JobInterestCard } from 'web/components/jobs/job-interest-card'

// All job data lives here. To add, edit, or remove a listing, change this array
// and open a PR — there is intentionally no database or employer-facing editor.
// Employers email us to list a role or tell us when one is filled.
type Job = {
  title: string
  location: string
  comp: string
  stage: string
  blurb: string
  intro: string
  whatYoullDo: string[]
  whatWereLookingFor: string[]
  contactEmail: string
}

const JOBS: Job[] = [
  {
    title: 'Backend Engineer',
    location: 'SF',
    comp: 'Base + equity',
    stage: 'Pre-launch',
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
    location: 'SF',
    comp: 'Base + equity + carry',
    stage: 'Pre-launch',
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

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-400 shrink-0 font-mono text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-ink-700 text-sm font-medium">{value}</dd>
    </div>
  )
}

function JobCard({ job }: { job: Job }) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()

  return (
    <article
      className={clsx(
        'bg-canvas-0 overflow-hidden rounded-xl border transition-all',
        open
          ? 'border-primary-300 shadow-sm'
          : 'border-ink-200 hover:border-ink-300 hover:shadow-sm'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-canvas-50 focus-visible:ring-primary-500 group w-full cursor-pointer px-5 py-5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-6"
        aria-expanded={open}
        aria-controls={detailsId}
      >
        <Col className="gap-3">
          <Row className="items-start justify-between gap-3">
            <h3 className="text-ink-1000 text-lg font-bold sm:text-xl">
              {job.title}
            </h3>
            <span className="bg-canvas-100 text-ink-600 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium">
              Full time
            </span>
          </Row>
          <p className="text-ink-600 text-base leading-relaxed">{job.blurb}</p>

          <div className="border-ink-100 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              <MetaField label="Location" value={job.location} />
              <MetaField label="Comp" value={job.comp} />
              <MetaField label="Stage" value={job.stage} />
            </dl>

            <span className="text-primary-600 group-hover:text-primary-700 flex shrink-0 items-center gap-1 self-end text-sm font-semibold sm:self-auto">
              {open ? 'Hide details' : 'View details'}
              {open ? (
                <ChevronUpIcon className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronDownIcon className="h-4 w-4" aria-hidden />
              )}
            </span>
          </div>
        </Col>
      </button>

      <div
        id={detailsId}
        hidden={!open}
        className="border-ink-100 bg-canvas-50/50 border-t px-5 pb-6 pt-5 sm:px-6"
      >
        <p className="text-ink-700 mb-6 text-base leading-relaxed">
          {job.intro}
        </p>

        <section className="mb-6">
          <h4 className="text-ink-900 mb-3 text-sm font-semibold">
            What you'll do
          </h4>
          <ul className="marker:text-primary-400 flex list-disc flex-col gap-2 pl-5">
            {job.whatYoullDo.map((item, i) => (
              <li key={i} className="text-ink-700 text-base leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-6">
          <h4 className="text-ink-900 mb-3 text-sm font-semibold">
            What we're looking for
          </h4>
          <ul className="marker:text-primary-400 flex list-disc flex-col gap-2 pl-5">
            {job.whatWereLookingFor.map((item, i) => (
              <li key={i} className="text-ink-700 text-base leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <Row className="flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-primary-600 hover:text-primary-700 focus-visible:ring-primary-500 flex items-center gap-1 rounded text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2"
          >
            Hide details
            <ChevronUpIcon className="h-4 w-4" aria-hidden />
          </button>
          <a
            href={`mailto:${job.contactEmail}`}
            className="bg-primary-600 hover:bg-primary-700 focus-visible:ring-primary-500 rounded-md px-5 py-2 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Apply by email →
          </a>
        </Row>
      </div>
    </article>
  )
}

export default function JobsPage() {
  return (
    <Page trackPageView="/jobs" className="!col-span-7">
      <SEO
        title="Job Board"
        description="Curated jobs by employers who value forecasting."
        url="/jobs"
      />
      <Col className="mx-auto w-full max-w-4xl gap-7 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-2">
          <Row className="items-center gap-2">
            <BackButton />
            <h1 className="text-ink-1000 text-3xl font-semibold sm:text-4xl">
              Job Board
            </h1>
          </Row>
          <p className="text-ink-500 max-w-xl text-base leading-relaxed">
            Curated jobs by employers who value forecasting
          </p>
        </header>

        <JobInterestCard />

        <section aria-labelledby="mnx-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2
                  id="mnx-heading"
                  className="text-ink-1000 text-xl font-semibold"
                >
                  MNX — The AI Exchange
                </h2>
                <a
                  href="https://mnx.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Visit the MNX website"
                  className="text-primary-600 hover:text-primary-700 focus-visible:ring-primary-500 flex shrink-0 items-center gap-1 rounded text-sm font-medium focus:outline-none focus-visible:ring-2"
                >
                  mnx.fi
                  <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
              <p className="text-ink-500 max-w-2xl text-base leading-relaxed">
                MNX is building the financial architecture for the AI era. We
                are a small, highly talented, and maximally AI-pilled team based
                in San Francisco.
              </p>
            </div>
            <span className="bg-canvas-100 text-ink-600 shrink-0 self-start rounded-full px-3 py-1 text-sm font-medium">
              {JOBS.length} open role{JOBS.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {JOBS.map((job) => (
              <JobCard key={job.title} job={job} />
            ))}
          </div>
        </section>

        <aside className="border-ink-200 bg-canvas-50 rounded-lg border px-5 py-4">
          <p className="text-ink-600 text-sm">
            Hiring in trading, AI, or fintech?{' '}
            <a
              href="mailto:info@manifold.markets"
              className="text-primary-600 hover:text-primary-700 focus-visible:ring-primary-500 rounded font-medium focus:outline-none focus-visible:ring-2"
            >
              Get in touch to list a role.
            </a>
          </p>
        </aside>
      </Col>
    </Page>
  )
}
