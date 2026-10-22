import { Cron, CronOptions } from 'croner'
import { log } from 'shared/monitoring/log'
import { withMonitoringContext } from 'shared/monitoring/context'
import * as crypto from 'crypto'
import { createSupabaseClient } from 'shared/supabase/init'

// type for scheduled job functions
export type JobContext = {
  lastEndTime?: number
  lastStartTime?: number
}

// Isolated infra blips (DB pool churn, brief network loss) crash a handful of
// runs a day platform-wide, and the next scheduled run recovers. A single
// transient failure logs as a WARNING so the job-crash alert policy
// (severity>=ERROR) stays quiet; it escalates to ERROR when the same job
// fails twice in a row or the error is not a known-transient class.
//
// "Twice in a row" has to survive a process restart. Counted only in memory,
// it reset whenever the container restarted, which for a once-a-day job is
// most days: update-stats failed on 'Query read timeout' every night from
// 2026-09-20 and logged ten of those failures as first-time WARNINGs, so the
// alert never fired. scheduler_info already records it durably — a run
// writes last_start_time when it starts and last_end_time only when it
// succeeds — so a previous run that started and never ended counts as the
// first failure of a streak.
const TRANSIENT_ERROR_SNIPPETS = [
  'Connection terminated due to connection timeout',
  'timeout exceeded when trying to connect',
  'Query read timeout',
  'Client has encountered a connection error and is not queryable',
]

const isTransientInfraError = (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  return TRANSIENT_ERROR_SNIPPETS.some((s) => message.includes(s))
}

const consecutiveFailures = new Map<string, number>()
// Per job: did the previous run start and never finish (threw, or the process
// died mid-run)? Re-read from scheduler_info at the start of every run.
const previousRunUnfinished = new Map<string, boolean>()

// todo: would be nice if somehow we got these hooked up to the job logging context
const DEFAULT_OPTS: CronOptions = {
  timezone: 'America/Los_Angeles',
  protect: (job) => {
    log.warn(
      `[${job.name}] Still alive (since ${job.currentRun()?.toISOString()}).`
    )
  },
  catch: (err, job) => {
    const details: Record<string, any> = { err }
    if (err instanceof Error) {
      details.stack = err.stack
    }
    const name = job.name ?? 'unnamed'
    const failures = (consecutiveFailures.get(name) ?? 0) + 1
    consecutiveFailures.set(name, failures)
    const repeated = failures > 1 || previousRunUnfinished.get(name) === true
    if (!repeated && isTransientInfraError(err)) {
      log.warn(
        `[${name}] Run failed on a transient infra error; the next run recovers. Escalates to ERROR if it repeats back-to-back.`,
        details
      )
      return
    }
    log.error(`[${name}] Error during job execution.`, details)
  },
}

export function createJob(
  name: string,
  schedule: string | null,
  fn: (ctx: JobContext) => Promise<void>
) {
  const opts = { name, ...DEFAULT_OPTS }
  return new Cron(schedule ?? new Date(0), opts, async () => {
    const traceId = crypto.randomUUID()
    const context = { job: name, traceId }
    return await withMonitoringContext(context, async () => {
      log('Starting up.')
      const db = createSupabaseClient()

      // Get last end/start time in case the function wants to use them.
      // Read before overwriting last_start_time below so the value reflects
      // the PREVIOUS run's start, not the current one.
      const priorInfo = (
        await db
          .from('scheduler_info')
          .select('last_end_time, last_start_time')
          .eq('job_name', name)
      ).data?.[0]
      const lastEndTimeStamp = priorInfo?.last_end_time
      const lastStartTimeStamp = priorInfo?.last_start_time
      previousRunUnfinished.set(
        name,
        !!lastStartTimeStamp &&
          (!lastEndTimeStamp ||
            new Date(lastEndTimeStamp) < new Date(lastStartTimeStamp))
      )

      // Update last start time
      await db
        .from('scheduler_info')
        .upsert(
          { job_name: name, last_start_time: new Date().toISOString() },
          { onConflict: 'job_name' }
        )
      log(`Last end time: ${lastEndTimeStamp ?? 'never'}`)

      const jobPromise = fn({
        lastEndTime: lastEndTimeStamp
          ? new Date(lastEndTimeStamp).valueOf()
          : undefined,
        lastStartTime: lastStartTimeStamp
          ? new Date(lastStartTimeStamp).valueOf()
          : undefined,
      })

      await jobPromise
      consecutiveFailures.delete(name)
      // Update last end time
      await db
        .from('scheduler_info')
        .upsert(
          { job_name: name, last_end_time: new Date().toISOString() },
          { onConflict: 'job_name' }
        )
      log('Shutting down.')
    })
  })
}
