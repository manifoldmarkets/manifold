import { Request } from 'express'
import { getBestClientIp } from 'common/client-ip'

import { tryOrLogError } from 'shared/helpers/try-or-log-error'
import { trackAuditEvent } from 'shared/audit-events'

export const track = async (
  _userId: string,
  _eventName: string,
  _eventProperties?: any,
  _amplitudeProperties?: unknown
) => {
  return
}
export const trackPublicEvent = async (
  userId: string,
  eventName: string,
  eventProperties?: any,
  _amplitudeProperties?: unknown
) => {
  const allProperties = Object.assign(eventProperties ?? {}, {})
  const { contractId, commentId, ...data } = allProperties
  return await tryOrLogError(
    trackAuditEvent(userId, eventName, contractId, commentId, data)
  )
}

export const getIp = (req: Request) => {
  return getBestClientIp(req.headers, [req.socket.remoteAddress, req.ip])
}
