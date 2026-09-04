import { useState } from 'react'
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
    <div className="flex flex-row items-baseline gap-3 sm:flex-col sm:items-start sm:gap-0">
      <span className="text-ink-400 w-20 shrink-0 font-mono text-[10px] uppercase tracking-widest sm:w-auto">
        {label}
      </span>
      <span className="text-ink-700 text-sm font-medium">{value}</span>
    </div>
  )
}

function JobCard({ job }: { job: Job }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-ink-200 bg-canvas-0 overflow-hidden rounded-lg border transition-shadow hover:shadow-sm">
      {/* Card header — always visible */}
      {/* The whole header is the toggle, so it needs to look pressable:
          pointer cursor + a faint hover wash, otherwise the only affordance is
          the "Show role" text in the corner. */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-canvas-50 w-full cursor-pointer px-6 py-5 text-left transition-colors"
        aria-expanded={open}
      >
        <Col className="gap-2">
          <Row className="items-start justify-between gap-3">
            {/* h3, under the company's h2 — and capped at text-xl so a role
                never outsizes the company heading above it. */}
            <h3 className="text-ink-1000 text-lg font-bold sm:text-xl">
              {job.title}
            </h3>
            <span className="text-ink-400 shrink-0 pt-1 font-mono text-[10px] uppercase tracking-widest">
              Full time
            </span>
          </Row>
          <p className="text-ink-600 text-sm leading-relaxed">{job.blurb}</p>

          {/* Compact vertical stack on mobile; horizontal spread on desktop.
              Toggle drops below on mobile, inline bottom-right on sm+. */}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-8">
              <MetaField label="Location" value={job.location} />
              <MetaField label="Comp" value={job.comp} />
              <MetaField label="Stage" value={job.stage} />
            </div>

            <span className="text-primary-600 shrink-0 self-end font-mono text-sm font-medium">
              {open ? 'Hide ↑' : 'Show role ↓'}
            </span>
          </div>
        </Col>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="border-ink-100 border-t px-6 pb-6 pt-5">
          <p className="text-ink-700 mb-6 text-sm leading-relaxed">
            {job.intro}
          </p>

          <div className="mb-5">
            <span className="text-ink-400 mb-3 block font-mono text-xs uppercase tracking-widest">
              What you'll do
            </span>
            <ul className="flex flex-col gap-2">
              {job.whatYoullDo.map((item, i) => (
                <li
                  key={i}
                  className="text-ink-700 flex gap-2.5 text-sm leading-relaxed"
                >
                  <span className="text-ink-300 mt-0.5 shrink-0">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mb-6">
            <span className="text-ink-400 mb-3 block font-mono text-xs uppercase tracking-widest">
              What we're looking for
            </span>
            <ul className="flex flex-col gap-2">
              {job.whatWereLookingFor.map((item, i) => (
                <li
                  key={i}
                  className="text-ink-700 flex gap-2.5 text-sm leading-relaxed"
                >
                  <span className="text-ink-300 mt-0.5 shrink-0">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <Row className="items-center justify-between">
            <button
              onClick={() => setOpen(false)}
              className="text-primary-600 hover:text-primary-700 font-mono text-sm font-medium transition-colors"
            >
              Hide ↑
            </button>
            <a
              href={`mailto:${job.contactEmail}`}
              className="bg-primary-600 hover:bg-primary-700 rounded-md px-5 py-2 font-mono text-sm text-white transition-colors"
            >
              Apply →
            </a>
          </Row>
        </div>
      )}
    </div>
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
      <Col className="mx-auto w-full max-w-3xl gap-8 p-4 py-8">
        {/* Back arrow sits inline with the heading only — the subtitle drops
            below the whole row, so the arrow doesn't float against the centre
            of a two-line block. */}
        <Col className="gap-2">
          <Row className="items-center gap-2">
            <BackButton />
            <h1 className="text-ink-1000 text-3xl font-semibold sm:text-4xl">
              Job Board
            </h1>
          </Row>
          <p className="text-ink-500 max-w-xl text-base leading-relaxed">
            Curated jobs by employers who value forecasting
          </p>
        </Col>

        <JobInterestCard />

        {/* gap-4 inside the company block vs the page's gap-8 between
            sections, so the listings read as belonging to the company header
            rather than floating equidistant from everything. */}
        <Col className="gap-4">
          <Col className="gap-1">
            {/* Role count sits beside the company name rather than orphaned
                under the description, where it read as a third stray line. */}
            <Row className="items-baseline justify-between gap-3">
              <Row className="items-baseline gap-2">
                <h2 className="text-ink-1000 text-xl font-semibold">
                  MNX — The AI Exchange
                </h2>
                <a
                  href="https://mnx.fi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 shrink-0 text-xs"
                >
                  mnx.fi ↗
                </a>
              </Row>
              <span className="text-ink-400 shrink-0 font-mono text-xs uppercase tracking-wider">
                {JOBS.length} open role{JOBS.length !== 1 ? 's' : ''}
              </span>
            </Row>
            <p className="text-ink-500 max-w-xl text-sm leading-relaxed">
              MNX is building the financial architecture for the AI era. We are
              a small, highly talented, and maximally AI-pilled team based in
              San Francisco.
            </p>
          </Col>
          {JOBS.map((job) => (
            <JobCard key={job.title} job={job} />
          ))}
        </Col>

        <div className="border-ink-100 border-t pt-6">
          <p className="text-ink-400 text-sm">
            Hiring in trading, AI, or fintech?{' '}
            <a
              href="mailto:info@manifold.markets"
              className="text-primary-600 hover:text-primary-700"
            >
              Get in touch to list a role.
            </a>
          </p>
        </div>
      </Col>
    </Page>
  )
}
