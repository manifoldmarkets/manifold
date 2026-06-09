import { useState } from 'react'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { JOBS, Job } from 'web/lib/jobs-data'

function JobCard({ job }: { job: Job }) {
  const [open, setOpen] = useState(false)

  const remoteLabel =
    job.remote === 'remote-first'
      ? 'Remote-first'
      : job.remote === 'remote'
      ? 'Remote'
      : job.remote === 'hybrid'
      ? 'Hybrid'
      : 'On-site'

  return (
    <div className="border-ink-200 bg-canvas-0 rounded-lg border overflow-hidden transition-shadow hover:shadow-sm">
      {/* Card header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-5 text-left"
        aria-expanded={open}
      >
        <Row className="items-start justify-between gap-4">
          <Col className="gap-0.5 min-w-0">
            <span className="text-ink-500 font-mono text-xs uppercase tracking-wider">
              {job.company}
            </span>
            <h2 className="text-ink-1000 text-xl font-semibold">{job.title}</h2>
          </Col>
          <Row className="shrink-0 items-center gap-3 pt-1">
            <Row className="items-center gap-2">
              <span className="text-ink-400 font-mono text-xs uppercase tracking-wider">
                Full-time
              </span>
              <span className="text-ink-300 text-xs">·</span>
              <span className="text-ink-400 font-mono text-xs uppercase tracking-wider">
                {remoteLabel}
              </span>
            </Row>
          </Row>
        </Row>

        <Row className="mt-3 flex-wrap gap-1.5">
          {job.tags.map((tag) => (
            <span
              key={tag}
              className="border-ink-200 text-ink-500 rounded-full border px-2.5 py-0.5 font-mono text-xs"
            >
              {tag}
            </span>
          ))}
        </Row>

        <Row className="mt-4 items-center justify-between">
          <Row className="gap-6">
            <Col className="gap-0">
              <span className="text-ink-400 font-mono text-[10px] uppercase tracking-widest">
                Comp
              </span>
              <span className="text-ink-700 text-sm font-medium">{job.comp}</span>
            </Col>
            <Col className="gap-0">
              <span className="text-ink-400 font-mono text-[10px] uppercase tracking-widest">
                Stage
              </span>
              <span className="text-ink-700 text-sm font-medium">{job.stage}</span>
            </Col>
            {job.reportsTo && (
              <Col className="gap-0">
                <span className="text-ink-400 font-mono text-[10px] uppercase tracking-widest">
                  Reports to
                </span>
                <span className="text-ink-700 text-sm font-medium">{job.reportsTo}</span>
              </Col>
            )}
          </Row>
          <span className="text-primary-600 font-mono text-sm font-medium">
            {open ? 'Hide ↑' : 'Show role ↓'}
          </span>
        </Row>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="border-ink-100 border-t px-6 pb-6 pt-5">
          <p className="text-ink-700 mb-6 text-sm leading-relaxed">{job.problemSolved}</p>

          <div className="mb-5">
            <span className="text-ink-400 mb-3 block font-mono text-xs uppercase tracking-widest">
              What you'll do
            </span>
            <ul className="flex flex-col gap-2">
              {job.theWork.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-ink-700 leading-relaxed">
                  <span className="text-ink-300 shrink-0 mt-0.5">·</span>
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
              {job.whoYouAre.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-ink-700 leading-relaxed">
                  <span className="text-ink-300 shrink-0 mt-0.5">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <Row className="items-center justify-between">
            <span className="text-ink-400 font-mono text-xs">{job.contactEmail}</span>
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

export default function JobsPage2() {
  return (
    <Page trackPageView="/jobs-2" className="!col-span-7">
      <SEO
        title="Manifold Jobs"
        description="Jobs in trading, AI, and fintech — curated for people who think in probabilities."
        url="/jobs-2"
      />
      <Col className="mx-auto w-full max-w-3xl gap-8 p-4 py-8">
        <Col className="gap-2">
          <Row className="items-center gap-2">
            <span className="bg-primary-500 h-2 w-2 rounded-full" />
            <span className="text-primary-600 font-mono text-sm font-medium uppercase tracking-widest">
              Manifold Jobs
            </span>
          </Row>
          <h1 className="text-ink-1000 text-3xl font-semibold sm:text-4xl">
            Roles worth thinking about
          </h1>
          <p className="text-ink-500 max-w-xl text-base leading-relaxed">
            Curated jobs in trading, AI, and fintech — for people who think in probabilities.
            Every listing includes honest trade-offs, not just requirements.
          </p>
        </Col>

        <Col className="gap-3">
          <span className="text-ink-400 font-mono text-xs uppercase tracking-wider">
            {JOBS.length} open role{JOBS.length !== 1 ? 's' : ''}
          </span>
          {JOBS.map((job) => (
            <JobCard key={job.slug} job={job} />
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
