import { Cron, CronOptions } from 'croner'
import { gLog as log } from 'shared/utils'

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

export function createJob(name: string, schedule: string, fn: Function) {
  const opts = { name, ...DEFAULT_OPTS }
  return Cron(schedule, opts, async () => {
    log.info(`[${name}] Starting up.`)
    await fn()
    log.info(`[${name}] Shutting down.`)
  })
}
