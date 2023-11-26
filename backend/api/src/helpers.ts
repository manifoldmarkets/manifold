import * as admin from 'firebase-admin'
import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'

import { PrivateUser } from 'common/user'
import { APIError } from 'common/api'
import { gLog, GCPLog, log } from 'shared/utils'
export { APIError } from 'common/api'
import * as crypto from 'crypto'

export type Json = Record<string, unknown>
export type Handler<T> = (req: Request) => Promise<T>
export type JsonHandler<T extends Json> = Handler<T>
export type AuthedHandler<T extends Json> = (
  req: Request,
  user: AuthedUser,
  log: GCPLog,
  logError: GCPLog
) => Promise<T>
export type MaybeAuthedHandler<T extends Json> = (
  req: Request,
  user: AuthedUser | undefined,
  log: GCPLog,
  logError: GCPLog
) => Promise<T>

export type AuthedUser = {
  uid: string
  creds: JwtCredentials | (KeyCredentials & { privateUser: PrivateUser })
}
type JwtCredentials = { kind: 'jwt'; data: admin.auth.DecodedIdToken }
type KeyCredentials = { kind: 'key'; data: string }
type Credentials = JwtCredentials | KeyCredentials

export const parseCredentials = async (req: Request): Promise<Credentials> => {
  const auth = admin.auth()
  const authHeader = req.get('Authorization')
  if (!authHeader) {
    throw new APIError(403, 'Missing Authorization header.')
  }
  const authParts = authHeader.split(' ')
  if (authParts.length !== 2) {
    throw new APIError(403, 'Invalid Authorization header.')
  }

  const [scheme, payload] = authParts
  switch (scheme) {
    case 'Bearer':
      if (payload === 'undefined') {
        throw new APIError(403, 'Firebase JWT payload undefined.')
      }
      try {
        return { kind: 'jwt', data: await auth.verifyIdToken(payload) }
      } catch (err) {
        // This is somewhat suspicious, so get it into the firebase console
        console.error('Error verifying Firebase JWT: ', err, scheme, payload)
        throw new APIError(403, 'Error validating token.')
      }
    case 'Key':
      return { kind: 'key', data: payload }
    default:
      throw new APIError(403, 'Invalid auth scheme; must be "Key" or "Bearer".')
  }
}

export const lookupUser = async (creds: Credentials): Promise<AuthedUser> => {
  const firestore = admin.firestore()
  const privateUsers = firestore.collection('private-users')
  switch (creds.kind) {
    case 'jwt': {
      if (typeof creds.data.user_id !== 'string') {
        throw new APIError(403, 'JWT must contain Manifold user ID.')
      }
      return { uid: creds.data.user_id, creds }
    }
    case 'key': {
      const key = creds.data
      const privateUserQ = await privateUsers.where('apiKey', '==', key).get()
      if (privateUserQ.empty) {
        throw new APIError(403, `No private user exists with API key ${key}.`)
      }
      const privateUser = privateUserQ.docs[0].data() as PrivateUser
      return { uid: privateUser.id, creds: { privateUser, ...creds } }
    }
    default:
      throw new APIError(500, 'Invalid credential type.')
  }
}

export const validate = <T extends z.ZodTypeAny>(schema: T, val: unknown) => {
  const result = schema.safeParse(val)
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      return {
        field: i.path.join('.') || null,
        error: i.message,
      }
    })
    log(issues)
    throw new APIError(400, 'Error validating request.', issues)
  } else {
    return result.data as z.infer<T>
  }
}

export const endpoint = <T>(fn: Handler<T>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).send(await fn(req))
    } catch (e) {
      next(e)
    }
  }
}

export const jsonEndpoint = <T extends Json>(fn: JsonHandler<T>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await fn(req))
    } catch (e) {
      next(e)
    }
  }
}
const getLogs = (req: Request) => {
  const traceContext = req.get('X-Cloud-Trace-Context')
  const traceId = traceContext
    ? traceContext.split('/')[0]
    : crypto.randomUUID()

  const log = (message: any, details?: object) =>
    gLog.debug(message, { ...details, endpoint: req.path, traceId })

  const logError = (message: any, details?: object) =>
    gLog.error(message, { ...details, endpoint: req.path, traceId })
  return { log, logError }
}
export const authEndpoint = <T extends Json>(fn: AuthedHandler<T>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authedUser = await lookupUser(await parseCredentials(req))
      const { log, logError } = getLogs(req)
      res.status(200).json(await fn(req, authedUser, log, logError))
    } catch (e) {
      next(e)
    }
  }
}
export const MaybeAuthedEndpoint = <T extends Json>(
  fn: MaybeAuthedHandler<T>
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    let authUser: AuthedUser | undefined = undefined
    try {
      authUser = await lookupUser(await parseCredentials(req))
    } catch {
      // it's treated as an anon request
    }

    try {
      const { log, logError } = getLogs(req)
      res.status(200).json(await fn(req, authUser, log, logError))
    } catch (e) {
      next(e)
    }
  }
}
