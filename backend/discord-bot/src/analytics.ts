import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'
import { tryOrLogError } from 'shared/helpers/try-or-log-error'
import * as Amplitude from '@amplitude/node'

// The way isProd() is implemented now would require installing firebase-admin here,
// so duplicating the tracking code for now
const key =
  process.env.ENVIRONMENT == 'PROD'
    ? PROD_CONFIG.amplitudeApiKey
    : DEV_CONFIG.amplitudeApiKey

const amp = Amplitude.init(key ?? '')

export const track = async (
  userId: string,
  eventName: string,
  eventProperties?: any,
  amplitudeProperties?: Partial<Amplitude.Event>
) => {
  return await tryOrLogError(
    amp.logEvent({
      event_type: eventName,
      user_id: userId,
      event_properties: eventProperties,
      ...amplitudeProperties,
    })
  )
}
