import { Cron, CronOptions } from 'croner'
import { JobContext } from 'shared/utils'
import { log, withLogContext } from 'shared/log'
import * as crypto from 'crypto'
import { createSupabaseClient } from 'shared/supabase/init'

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
    const logContext = { job: name, traceId }
    return await withLogContext(logContext, async () => {
      log('Starting up.')
      const db = createSupabaseClient()

      // Get last end time in case function wants to use it
      const lastEndTimeStamp = (
        await db
          .from('scheduler_info')
          .select('last_end_time')
          .eq('job_name', name)
      ).data?.[0]?.last_end_time

      // Update last start time
      await db
        .from('scheduler_info')
        .upsert(
          { job_name: name, last_start_time: new Date().toISOString() },
          { onConflict: 'job_name' }
        )
      log(`Last end time: ${lastEndTimeStamp ?? 'never'}`)

      // Run job
      await fn({
        log: log.info,
        lastEndTime: lastEndTimeStamp
          ? new Date(lastEndTimeStamp).valueOf()
          : undefined,
      })

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
