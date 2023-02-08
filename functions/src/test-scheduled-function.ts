import { APIError, newEndpoint } from './api'
import {
  saveWeeklyContractMetricsInternal,
  sendWeeklyPortfolioUpdateNotifications,
} from 'functions/src/weekly-portfolio-updates'
import { isProd } from 'functions/src/utils'

// Function for testing scheduled functions locally
export const testscheduledfunction = newEndpoint(
  { method: 'GET', memory: '4GiB' },
  async (_req) => {
    if (isProd())
      throw new APIError(400, 'This function is only available in dev mode')

    await saveWeeklyContractMetricsInternal()
    await sendWeeklyPortfolioUpdateNotifications()

    return { success: true }
  }
)
