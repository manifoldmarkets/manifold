import { APIError, newEndpoint } from './api'
import { sendPortfolioUpdateEmailsToAllUsers } from './weekly-portfolio-emails'
import { isProd } from './utils'

export const testscheduledfunction = newEndpoint(
  { method: 'GET', memory: '4GiB' },
  async (_req) => {
    // Replace your function here
    if (isProd())
      throw new APIError(400, 'This function is only available in dev mode')

    await sendPortfolioUpdateEmailsToAllUsers()

    return { success: true }
  }
)
