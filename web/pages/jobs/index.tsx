import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { JOBS, Job } from 'web/lib/jobs-data'

function RemoteBadge({ remote }: { remote: Job['remote'] }) {
  const label =
    remote === 'remote-first'
      ? 'Remote-first'
      : remote === 'remote'
      ? 'Remote'
      : remote === 'hybrid'
      ? 'Hybrid'
      : remote === 'on-site'
      ? 'On-site'
      : 'Flexible'
  return (
    <span className="text-ink-500 font-mono text-xs uppercase tracking-wider">{label}</span>
  )
}

function JobCard({ job }: { job: Job }) {
  return (
    <Link href={`/jobs/${job.slug}`} className="group block">
      <div className="border-ink-200 bg-canvas-0 hover:border-primary-400 rounded-lg border p-6 transition-colors">
        <Row className="mb-3 items-start justify-between gap-4">
          <Col className="gap-0.5">
            <span className="text-ink-500 font-mono text-xs uppercase tracking-wider">
              {job.company}
            </span>
            <h2 className="text-ink-1000 text-xl font-semibold">{job.title}</h2>
          </Col>
          <Row className="shrink-0 items-center gap-2">
            <span className="text-ink-500 font-mono text-xs uppercase tracking-wider">
              Full-time
            </span>
            <span className="text-ink-300">·</span>
            <RemoteBadge remote={job.remote} />
          </Row>
        </Row>

        <p className="text-ink-600 mb-4 text-sm leading-relaxed">{job.companyTagline}</p>

        <Row className="mb-4 flex-wrap gap-1.5">
          {job.tags.map((tag) => (
            <span
              key={tag}
              className="border-ink-200 text-ink-600 rounded-full border px-2.5 py-0.5 font-mono text-xs"
            >
              {tag}
            </span>
          ))}
        </Row>

        <Row className="items-center gap-6">
          <Col className="gap-0">
            <span className="text-ink-400 font-mono text-xs uppercase tracking-wider">Comp</span>
            <span className="text-ink-700 text-sm font-medium">{job.comp}</span>
          </Col>
          <Col className="gap-0">
            <span className="text-ink-400 font-mono text-xs uppercase tracking-wider">Stage</span>
            <span className="text-ink-700 text-sm font-medium">{job.stage}</span>
          </Col>
          {job.reportsTo && (
            <Col className="gap-0">
              <span className="text-ink-400 font-mono text-xs uppercase tracking-wider">
                Reports to
              </span>
              <span className="text-ink-700 text-sm font-medium">{job.reportsTo}</span>
            </Col>
          )}
          {job.stack && (
            <Col className="gap-0">
              <span className="text-ink-400 font-mono text-xs uppercase tracking-wider">Stack</span>
              <span className="text-ink-700 text-sm font-medium">{job.stack}</span>
            </Col>
          )}
          <div className="ml-auto">
            <span className="text-primary-600 group-hover:text-primary-700 font-mono text-sm">
              View role →
            </span>
          </div>
        </Row>
      </div>
    </Link>
  )
}

export default function JobsPage() {
  return (
    <Page trackPageView="/jobs" className="!col-span-7">
      <SEO
        title="Manifold Jobs"
        description="Jobs in trading, AI, and fintech — curated for people who think in probabilities."
        url="/jobs"
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
          <Row className="items-center justify-between">
            <span className="text-ink-400 font-mono text-xs uppercase tracking-wider">
              {JOBS.length} open role{JOBS.length !== 1 ? 's' : ''}
            </span>
          </Row>
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
