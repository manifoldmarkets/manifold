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
    log.error(`[${job.name}] Error during job execution.`, details)
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
