import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { ExternalLinkIcon, LocationMarkerIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useId, useState } from 'react'

import {
  AppliedNudge,
  ApplyLink,
  applyHref,
} from 'web/components/jobs/apply-link'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { type Job, type JobBoardEmployer } from 'web/lib/jobs'
import { track } from 'web/lib/service/analytics'

export function JobCard(props: { job: Job; employer: JobBoardEmployer }) {
  const { job, employer } = props
  const [open, setOpen] = useState(false)
  const [applied, setApplied] = useState(false)
  const detailsId = useId()

  return (
    <article
      className={clsx(
        'bg-canvas-0 overflow-hidden rounded-2xl border transition-colors dark:bg-slate-800/60 dark:shadow-sm dark:shadow-black/20',
        open
          ? 'border-primary-300 shadow-sm dark:border-indigo-400/50'
          : 'border-ink-200 hover:border-ink-300 hover:shadow-sm dark:border-slate-700/70 dark:hover:border-slate-500'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-canvas-50 focus-visible:ring-primary-500 group w-full cursor-pointer px-5 py-6 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset dark:hover:bg-slate-700/30 sm:px-6"
        aria-expanded={open}
        aria-controls={detailsId}
      >
        <Col className="gap-3">
          <Row className="items-start justify-between gap-3">
            <h4 className="text-ink-1000 text-xl font-semibold tracking-tight dark:text-slate-100 sm:text-2xl">
              {job.title}
            </h4>
            <span className="bg-ink-100 text-ink-600 shrink-0 rounded-md px-2 py-1 text-xs font-medium dark:bg-slate-700/50 dark:text-slate-300">
              {job.employmentType ?? 'Full time'}
            </span>
          </Row>
          <p className="text-ink-600 text-base leading-relaxed dark:text-slate-300">
            {job.blurb}
          </p>

          <dl className="text-ink-600 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm dark:text-slate-300">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Location</dt>
              <LocationMarkerIcon
                className="text-ink-500 h-4 w-4 dark:text-slate-400"
                aria-hidden
              />
              <dd>{job.location}</dd>
            </div>
            <div>
              <dt className="sr-only">Compensation</dt>
              <dd>{job.comp}</dd>
            </div>
          </dl>
          <div className="border-ink-100 mt-2 flex items-center justify-end border-t pt-4 dark:border-slate-700/60">
            <span className="text-primary-600 group-hover:text-primary-700 flex items-center gap-1.5 text-sm font-semibold dark:text-indigo-300 dark:group-hover:text-indigo-200">
              {open ? 'Hide details' : 'Explore role'}
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
        className="border-ink-100 bg-canvas-50/50 border-t px-5 pb-6 pt-5 dark:border-slate-700/60 dark:bg-slate-900/50 sm:px-6"
      >
        {job.team && (
          <p className="text-ink-500 mb-4 text-sm dark:text-slate-400">
            {job.team}
          </p>
        )}
        <p className="text-ink-700 mb-6 text-base leading-relaxed dark:text-slate-300">
          {job.intro}
        </p>

        {job.workArrangement && (
          <p className="text-ink-700 mb-6 text-sm leading-relaxed dark:text-slate-300">
            {job.workArrangement}
          </p>
        )}
        {job.compDetails && (
          <div className="text-ink-600 mb-6 flex flex-col gap-1 text-sm leading-relaxed dark:text-slate-400">
            {job.compDetails.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}

        <section className="mb-6">
          <h5 className="text-ink-900 mb-3 text-sm font-semibold dark:text-slate-100">
            What you'll do
          </h5>
          <ul className="marker:text-primary-400 flex list-disc flex-col gap-2 pl-5 dark:marker:text-indigo-400">
            {job.whatYoullDo.map((item, i) => (
              <li
                key={i}
                className="text-ink-700 text-base leading-relaxed dark:text-slate-300"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-6">
          <h5 className="text-ink-900 mb-3 text-sm font-semibold dark:text-slate-100">
            What we're looking for
          </h5>
          <ul className="marker:text-primary-400 flex list-disc flex-col gap-2 pl-5 dark:marker:text-indigo-400">
            {job.whatWereLookingFor.map((item, i) => (
              <li
                key={i}
                className="text-ink-700 text-base leading-relaxed dark:text-slate-300"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <p className="text-ink-700 mb-6 select-text text-sm leading-relaxed dark:text-slate-300">
          {employer.applyInstructions ?? (
            <>To apply, email {job.contactEmail}.</>
          )}
        </p>

        <ApplyLink
          href={applyHref(job)}
          employer={employer}
          job={job}
          onApply={() => setApplied(true)}
          className="bg-primary-600 hover:bg-primary-700 focus-visible:ring-primary-500 mb-5 inline-flex rounded-lg px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          Apply to {employer.name} by email
        </ApplyLink>

        {applied && <AppliedNudge employer={employer} className="mb-5" />}

        <Row className="flex-wrap items-center gap-x-5 gap-y-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-primary-600 hover:text-primary-700 focus-visible:ring-primary-500 flex items-center gap-1 rounded text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 dark:text-indigo-300 dark:hover:text-indigo-200"
          >
            Hide details
            <ChevronUpIcon className="h-4 w-4" aria-hidden />
          </button>
          {job.sourceUrl && (
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                track('job source click', {
                  employer: employer.id,
                  role: job.title,
                })
              }
              className="text-ink-500 hover:text-ink-700 focus-visible:ring-primary-500 inline-flex items-center gap-1 rounded text-sm focus:outline-none focus-visible:ring-2 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Full role details on {employer.name}
              <ExternalLinkIcon className="h-4 w-4" aria-hidden />
            </a>
          )}
        </Row>
      </div>
    </article>
  )
}
