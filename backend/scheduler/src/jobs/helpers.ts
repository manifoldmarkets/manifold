import { Cron, CronOptions } from 'croner'
import { GCPLog, gLog as log } from 'shared/utils'
import * as crypto from 'crypto'

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
  schedule: string,
  fn: (log: GCPLog) => Promise<void>
) {
  const opts = { name, ...DEFAULT_OPTS }
  return Cron(schedule, opts, async () => {
    const logWithDetails = (message: any, details?: object) =>
      log.debug(message, {
        ...details,
        job: name,
        traceId: crypto.randomUUID(),
      })
    logWithDetails(`[${name}] Starting up.`)
    await fn(logWithDetails)
    logWithDetails(`[${name}] Shutting down.`)
  })
}
