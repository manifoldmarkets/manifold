import { tryOrLogError } from 'shared/helpers/try-or-log-error'
import * as Amplitude from '@amplitude/node'
import { ENV_CONFIG } from 'common/envs/constants'

const key = ENV_CONFIG.amplitudeApiKey
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
