import { APIError, newEndpoint } from './helpers'
import { saveWeeklyContractMetricsInternal } from '../scheduled/weekly-portfolio-updates'
import { isProd } from 'shared/utils'

// Function for testing scheduled functions locally
export const testscheduledfunction = newEndpoint(
  { method: 'GET', memory: '4GiB' },
  async (_req) => {
    if (isProd())
      throw new APIError(400, 'This function is only available in dev mode')
    try {
      await saveWeeklyContractMetricsInternal()
    } catch (e) {
      console.log(e)
    }
    // await sendWeeklyPortfolioUpdateNotifications()

    return { success: true }
  }
)
