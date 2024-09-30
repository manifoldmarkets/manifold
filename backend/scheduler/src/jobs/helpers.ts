import { Cron, CronOptions } from 'croner'
import { log } from 'shared/monitoring/log'
import { withMonitoringContext } from 'shared/monitoring/context'
import * as crypto from 'crypto'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { upsert } from 'shared/supabase/utils'

// type for scheduled job functions
export type JobContext = {
  lastEndTime?: number
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
  return Cron(schedule ?? new Date(0), opts, async () => {
    const traceId = crypto.randomUUID()
    const context = { job: name, traceId }
    return await withMonitoringContext(context, async () => {
      log('Starting up.')
      const pg = createSupabaseDirectClient()

      // Get last end time in case function wants to use it
      const lastEndTimeStamp = await pg.one(
        `select last_end_time from scheduler_info where job_name = $1`,
        name,
        (r) => r.last_end_time as string
      )

      // Update last start time
      await upsert(pg, 'scheduler_info', 'job_name', {
        job_name: name,
        last_start_time: new Date().toISOString(),
      })
      log(`Last end time: ${lastEndTimeStamp ?? 'never'}`)

      const jobPromise = fn({
        lastEndTime: lastEndTimeStamp
          ? new Date(lastEndTimeStamp).valueOf()
          : undefined,
      })

      await jobPromise
      // Update last end time
      await upsert(pg, 'scheduler_info', 'job_name', {
        job_name: name,
        last_end_time: new Date().toISOString(),
      })

      log('Shutting down.')
    })
  })
}
