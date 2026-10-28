import clsx from 'clsx'
import { ReactNode } from 'react'

import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { type Job, type JobBoardEmployer } from 'web/lib/jobs'
import { track } from 'web/lib/service/analytics'

// The role's application link (an employer tracking URL or a mailto) when it
// has one; otherwise a mailto to the role's contact with the role in the subject.
export const applyHref = (job: Job) =>
  job.applicationUrl ??
  `mailto:${job.contactEmail}?subject=${encodeURIComponent(
    `${job.title} via Manifold`
  )}`

export const isExternalUrl = (href: string) => /^https?:\/\//.test(href)

// Every apply link on the board goes through here. The click is tracked and,
// for signed-in users, recorded against the employer (set-job-applied) so they
// drop out of that employer's update emails. Applying to any of an employer's
// roles counts for all of them. Web links open in a new tab, so the board
// stays open, the click is recorded and the follow-up nudge shows; the native
// app opens external URLs in its in-app browser.
export function ApplyLink(props: {
  href: string
  employer: JobBoardEmployer
  job?: Job
  className?: string
  onApply?: () => void
  children: ReactNode
}) {
  const { href, employer, job, className, onApply, children } = props
  const user = useUser()

  const onClick = () => {
    track('job apply click', {
      employer: employer.id,
      role: job?.title ?? null,
      requisition: job?.team ?? null,
    })
    if (user) {
      api('set-job-applied', { employer: employer.id }).catch(() => {})
    }
    onApply?.()
  }

  return (
    <a
      href={href}
      target={isExternalUrl(href) ? '_blank' : undefined}
      rel={isExternalUrl(href) ? 'noopener noreferrer' : undefined}
      onClick={onClick}
      className={className}
    >
      {children}
    </a>
  )
}

// Shown once an apply link has been clicked: send applicants to the
// "Let your next role find you" card so we can match them with future roles.
export function AppliedNudge(props: {
  employer: JobBoardEmployer
  className?: string
}) {
  const { employer, className } = props
  return (
    <p
      className={clsx(
        'border-primary-200 bg-primary-50/50 text-ink-700 rounded-lg border px-4 py-3 text-sm leading-relaxed dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-slate-300',
        className
      )}
    >
      Applied to {employer.name}? Also{' '}
      <a
        href="#job-interest"
        className="text-primary-600 hover:text-primary-700 focus-visible:ring-primary-500 rounded font-semibold underline focus:outline-none focus-visible:ring-2 dark:text-indigo-300 dark:hover:text-indigo-200"
      >
        let your next role find you
      </a>{' '}
      so we can match you with roles like this one.
    </p>
  )
}
