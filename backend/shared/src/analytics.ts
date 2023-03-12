import * as Amplitude from '@amplitude/node'

import { DEV_CONFIG } from 'common/envs/dev'
import { PROD_CONFIG } from 'common/envs/prod'

import { isProd, tryOrLogError } from 'shared/utils'

const key = isProd() ? PROD_CONFIG.amplitudeApiKey : DEV_CONFIG.amplitudeApiKey

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
