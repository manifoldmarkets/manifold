import * as Amplitude from '@amplitude/node'
import { Request } from 'express'
import { tryOrLogError } from 'shared/helpers/try-or-log-error'
import { trackAuditEvent } from 'shared/audit-events'
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
export const trackPublicEvent = async (
  userId: string,
  eventName: string,
  eventProperties?: any,
  amplitudeProperties?: Partial<Amplitude.Event>
) => {
  const allProperties = Object.assign(eventProperties ?? {}, {})
  const { contractId, commentId, ...data } = allProperties
  return await tryOrLogError(
    Promise.all([
      amp.logEvent({
        event_type: eventName,
        user_id: userId,
        event_properties: eventProperties,
        ...amplitudeProperties,
      }),
      trackAuditEvent(userId, eventName, contractId, commentId, data),
    ])
  )
}

export const getIp = (req: Request) => {
  const xForwarded = req.headers['x-forwarded-for']
  const xForwardedIp = Array.isArray(xForwarded) ? xForwarded[0] : xForwarded

  return xForwardedIp ?? req.socket.remoteAddress ?? req.ip
}
