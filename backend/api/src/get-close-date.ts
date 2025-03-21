import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getCloseDate } from 'shared/helpers/ai-close-date'
import { rateLimitByUser } from './helpers/rate-limit'
import { HOUR_MS } from 'common/util/time'

export const getCloseDateEndpoint: APIHandler<'get-close-date'> =
  rateLimitByUser(
    async (props) => {
      const { question } = props
      const utcOffset = props.utcOffset ?? new Date().getTimezoneOffset() * -1

      const timestamp = await getCloseDate(question, utcOffset)
      if (!timestamp) {
        throw new APIError(500, 'Failed to get close date')
      }

      return { closeTime: timestamp }
    },
    {
      maxCalls: 100,
      windowMs: HOUR_MS,
    }
  )
