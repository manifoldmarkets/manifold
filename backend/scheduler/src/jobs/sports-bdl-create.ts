import { runMajorCreation } from 'shared/bdl/create-major-markets'
import { isProd, log } from 'shared/utils'

export async function createMajorSportsMarkets() {
  try {
    const result = await runMajorCreation({
      role: isProd() ? 'scheduler' : 'dev',
    })
    for (const entry of result.log.filter((row) => row.status === 'error')) {
      log.error(
        `[sports-bdl-${entry.league}] ${entry.eventId ?? entry.league}: ${
          entry.reason
        }`
      )
    }
    log(
      `[sports-bdl-create] run finished: ${result.created} created, ${result.skipped} skipped, ${result.errors} errors`
    )
  } catch (error) {
    log.error(
      `[sports-bdl-create] run finished with an error: ${String(error)}`
    )
    throw error
  }
}
