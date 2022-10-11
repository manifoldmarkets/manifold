import { APIError, newEndpoint } from './api'
import { isProd } from './utils'
import { sendMarketCloseEmails } from 'functions/src/market-close-notifications'

// Function for testing scheduled functions locally
export const testscheduledfunction = newEndpoint(
  { method: 'GET', memory: '4GiB' },
  async (_req) => {
    if (isProd())
      throw new APIError(400, 'This function is only available in dev mode')

    // Replace your function here
    await sendMarketCloseEmails()

    return { success: true }
  }
)
