import { GetStaticPaths, GetStaticProps } from 'next'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { JOBS, Job, getJobBySlug } from 'web/lib/jobs-data'

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: JOBS.map((job) => ({ params: { slug: job.slug } })),
    fallback: false,
  }
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const job = getJobBySlug(params?.slug as string)
  if (!job) return { notFound: true }
  return { props: { job } }
}

function Divider({ label }: { label: string }) {
  return (
    <Row className="mb-5 items-center gap-3">
      <span className="text-ink-400 shrink-0 font-mono text-xs uppercase tracking-widest">
        {label}
      </span>
      <div className="border-ink-100 h-px flex-1 border-t" />
    </Row>
  )
}

function InfoTile({
  label,
  value,
  subValue,
}: {
  label: string
  value: string
  subValue?: string
}) {
  return (
    <Col className="border-ink-100 bg-canvas-50 min-w-0 flex-1 gap-0 rounded-lg border px-4 py-3">
      <span className="text-ink-400 mb-1 font-mono text-[10px] uppercase tracking-widest">
        {label}
      </span>
      <span className="text-ink-900 text-sm font-semibold leading-snug">{value}</span>
      {subValue && (
        <span className="text-ink-400 mt-0.5 text-xs leading-snug">{subValue}</span>
      )}
    </Col>
  )
}

export default function JobDetailPage({ job }: { job: Job }) {
  const remoteLabel =
    job.remote === 'remote-first'
      ? 'Remote-first'
      : job.remote === 'remote'
      ? 'Remote'
      : job.remote === 'hybrid'
      ? 'Hybrid'
      : job.remote === 'on-site'
      ? 'On-site'
      : 'Flexible'

  const infoTiles = [
    { label: 'Comp', value: job.comp, subValue: job.compNote },
    ...(job.reportsTo
      ? [{ label: 'Reports to', value: job.reportsTo, subValue: job.reportsToNote }]
      : []),
    ...(job.stack ? [{ label: 'Stack', value: job.stack, subValue: job.stackNote }] : []),
    { label: 'Stage', value: job.stage, subValue: job.stageNote },
  ]

  return (
    <Page trackPageView="/jobs/[slug]" className="!col-span-7">
      <SEO
        title={`${job.title} — ${job.company}`}
        description={job.problemSolved}
        url={`/jobs/${job.slug}`}
      />

      <Col className="mx-auto w-full max-w-3xl p-4 py-6">

        {/* Back nav */}
        <div className="mb-8">
          <Link
            href="/jobs"
            className="text-ink-400 hover:text-primary-600 font-mono text-xs uppercase tracking-widest transition-colors"
          >
            ← All roles
          </Link>
        </div>

        {/* Masthead */}
        <div className="bg-ink-900 dark:bg-canvas-50 mb-8 rounded-xl px-6 py-5">
          <Row className="mb-4 items-center justify-between gap-2">
            <span className="font-mono text-xs uppercase tracking-widest text-white/60 dark:text-ink-500">
              {job.company}
            </span>
            <Row className="items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-widest text-white/60 dark:text-ink-500">
                Full-time
              </span>
              <span className="text-white/30 dark:text-ink-300">·</span>
              <span className="font-mono text-xs uppercase tracking-widest text-white/60 dark:text-ink-500">
                {remoteLabel}
              </span>
            </Row>
          </Row>
          <h1 className="mb-4 text-3xl font-semibold text-white dark:text-ink-1000 sm:text-4xl">
            {job.title}
          </h1>
          <Row className="flex-wrap gap-1.5">
            {job.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/20 px-2.5 py-0.5 font-mono text-xs text-white/70 dark:border-ink-200 dark:text-ink-600"
              >
                {tag}
              </span>
            ))}
          </Row>
        </div>

        {/* Info tiles */}
        <Row className="mb-10 gap-2">
          {infoTiles.map((tile) => (
            <InfoTile
              key={tile.label}
              label={tile.label}
              value={tile.value}
              subValue={tile.subValue}
            />
          ))}
        </Row>

        {/* The problem */}
        <div className="mb-10">
          <Divider label="The problem this hire solves" />
          <p className="text-ink-800 text-lg leading-relaxed">{job.problemSolved}</p>
        </div>

        {/* The work */}
        <div className="mb-10">
          <Divider label="The work" />
          <ul className="flex flex-col gap-3">
            {job.theWork.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-primary-400 mt-1 shrink-0 text-xs">▸</span>
                <span className="text-ink-700 text-sm leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* What good looks like */}
        <div className="mb-10">
          <Divider label="What good looks like" />
          <Row className="gap-3">
            {[
              {
                label: '30 days',
                text: job.milestones.thirtyDays,
                accent: 'border-l-blue-400',
                labelColor: 'text-blue-600 dark:text-blue-400',
              },
              {
                label: '90 days',
                text: job.milestones.ninetyDays,
                accent: 'border-l-indigo-400',
                labelColor: 'text-indigo-600 dark:text-indigo-400',
              },
              {
                label: '1 year',
                text: job.milestones.oneYear,
                accent: 'border-l-violet-400',
                labelColor: 'text-violet-600 dark:text-violet-400',
              },
            ].map(({ label, text, accent, labelColor }) => (
              <Col
                key={label}
                className={`border-ink-100 min-w-0 flex-1 rounded-lg border border-l-4 p-4 ${accent}`}
              >
                <span
                  className={`mb-2 font-mono text-xs font-bold uppercase tracking-widest ${labelColor}`}
                >
                  {label}
                </span>
                <p className="text-ink-700 text-sm leading-relaxed">{text}</p>
              </Col>
            ))}
          </Row>
        </div>

        {/* Honest trade-offs */}
        <div className="mb-10">
          <Divider label="Honest trade-offs" />
          <Row className="gap-3">
            <Col className="min-w-0 flex-1 rounded-lg border border-l-4 border-green-200 border-l-green-500 bg-green-50 p-5 dark:border-green-900 dark:border-l-green-500 dark:bg-green-950/20">
              <span className="mb-4 font-mono text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">
                Great if you want
              </span>
              <ul className="flex flex-col gap-2.5">
                {job.greatIf.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-snug text-green-900 dark:text-green-300">
                    <span className="mt-0.5 shrink-0 font-mono">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Col>
            <Col className="min-w-0 flex-1 rounded-lg border border-l-4 border-orange-200 border-l-orange-400 bg-orange-50 p-5 dark:border-orange-900 dark:border-l-orange-400 dark:bg-orange-950/20">
              <span className="mb-4 font-mono text-xs font-bold uppercase tracking-widest text-orange-700 dark:text-orange-400">
                Hard if you need
              </span>
              <ul className="flex flex-col gap-2.5">
                {job.hardIf.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-snug text-orange-900 dark:text-orange-300">
                    <span className="mt-0.5 shrink-0 font-mono">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Col>
          </Row>
        </div>

        {/* Who you are */}
        <div className="mb-12">
          <Divider label="Who you are" />
          <ul className="flex flex-col gap-3">
            {job.whoYouAre.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-primary-400 mt-1 shrink-0 text-xs">▸</span>
                <span className="text-ink-700 text-sm leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Apply footer */}
        <div className="border-ink-100 rounded-xl border p-6">
          <Row className="items-center justify-between gap-4">
            <Col className="gap-1">
              <span className="text-ink-900 font-medium">Ready to apply?</span>
              <span className="text-ink-400 font-mono text-xs">
                Listed {job.listedDate} · {job.contactEmail}
              </span>
            </Col>
            <a
              href={`mailto:${job.contactEmail}`}
              className="bg-primary-600 hover:bg-primary-700 shrink-0 rounded-lg px-6 py-2.5 font-mono text-sm font-medium text-white transition-colors"
            >
              Apply →
            </a>
          </Row>
        </div>

      </Col>
    </Page>
  )
}
