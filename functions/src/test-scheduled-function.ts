import { APIError, newEndpoint } from './api'
import { isProd } from './utils'
import { send3DayCreatorGuideEmails } from './onboarding-emails'

// Function for testing scheduled functions locally
export const testscheduledfunction = newEndpoint(
  { method: 'GET', memory: '4GiB' },
  async (_req) => {
    if (isProd())
      throw new APIError(400, 'This function is only available in dev mode')

    await send3DayCreatorGuideEmails()
    return { success: true }
  }
)
