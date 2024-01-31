import * as admin from 'firebase-admin'
import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'

import { PrivateUser } from 'common/user'
import { APIError } from 'common//api/utils'
import { gLog, GCPLog, log } from 'shared/utils'
export { APIError } from 'common//api/utils'
import * as crypto from 'crypto'
import {
  API,
  APIPath,
  APIResponse,
  APISchema,
  ValidatedAPIParams,
} from 'common/api/schema'

export type Json = Record<string, unknown> | Json[]
export type JsonHandler<T extends Json> = (
  req: Request,
  log: GCPLog,
  logError: GCPLog,
  res: Response
) => Promise<T>
export type AuthedHandler<T extends Json> = (
  req: Request,
  user: AuthedUser,
  log: GCPLog,
  logError: GCPLog,
  res: Response
) => Promise<T>
export type MaybeAuthedHandler<T extends Json> = (
  req: Request,
  user: AuthedUser | undefined,
  log: GCPLog,
  logError: GCPLog,
  res: Response
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
    throw new APIError(401, 'Missing Authorization header.')
  }
  const authParts = authHeader.split(' ')
  if (authParts.length !== 2) {
    throw new APIError(401, 'Invalid Authorization header.')
  }

  const [scheme, payload] = authParts
  switch (scheme) {
    case 'Bearer':
      if (payload === 'undefined') {
        throw new APIError(401, 'Firebase JWT payload undefined.')
      }
      try {
        return { kind: 'jwt', data: await auth.verifyIdToken(payload) }
      } catch (err) {
        // This is somewhat suspicious, so get it into the firebase console
        console.error('Error verifying Firebase JWT: ', err, scheme, payload)
        throw new APIError(500, 'Error validating token.')
      }
    case 'Key':
      return { kind: 'key', data: payload }
    default:
      throw new APIError(401, 'Invalid auth scheme; must be "Key" or "Bearer".')
  }
}

export const lookupUser = async (creds: Credentials): Promise<AuthedUser> => {
  const firestore = admin.firestore()
  const privateUsers = firestore.collection('private-users')
  switch (creds.kind) {
    case 'jwt': {
      if (typeof creds.data.user_id !== 'string') {
        throw new APIError(401, 'JWT must contain Manifold user ID.')
      }
      return { uid: creds.data.user_id, creds }
    }
    case 'key': {
      const key = creds.data
      const privateUserQ = await privateUsers.where('apiKey', '==', key).get()
      if (privateUserQ.empty) {
        throw new APIError(401, `No private user exists with API key ${key}.`)
      }
      const privateUser = privateUserQ.docs[0].data() as PrivateUser
      return { uid: privateUser.id, creds: { privateUser, ...creds } }
    }
    default:
      throw new APIError(401, 'Invalid credential type.')
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

export const jsonEndpoint = <T extends Json>(fn: JsonHandler<T>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { log, logError } = getLogs(req)
      res.status(200).json(await fn(req, log, logError, res))
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

  const log = (message: any, details?: object | null) =>
    gLog.debug(message, { ...details, endpoint: req.path, traceId })

  const logError = (message: any, details?: object | null) =>
    gLog.error(message, { ...details, endpoint: req.path, traceId })
  return { log, logError }
}

export const getDummyLogs = (endpointPath: string) => {
  const traceId = crypto.randomUUID()

  const log = (message: any, details?: object | null) =>
    gLog.debug(message, { ...details, endpoint: endpointPath, traceId })

  const logError = (message: any, details?: object | null) =>
    gLog.error(message, { ...details, endpoint: endpointPath, traceId })
  return { log, logError }
}

export const authEndpoint = <T extends Json>(fn: AuthedHandler<T>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authedUser = await lookupUser(await parseCredentials(req))
      const { log, logError } = getLogs(req)
      res.status(200).json(await fn(req, authedUser, log, logError, res))
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
      res.status(200).json(await fn(req, authUser, log, logError, res))
    } catch (e) {
      next(e)
    }
  }
}

export type APIHandler<N extends APIPath> = (
  props: ValidatedAPIParams<N>,
  auth: APISchema<N> extends { authed: true }
    ? AuthedUser
    : AuthedUser | undefined,
  { log, logError }: { log: GCPLog; logError: GCPLog },
  res: Response
) => Promise<APIResponse<N>>

export const typedEndpoint = <N extends APIPath>(
  name: N,
  handler: APIHandler<N>
) => {
  const { props: propSchema, authed: authRequired, method } = API[name]

  return async (req: Request, res: Response, next: NextFunction) => {
    let authUser: AuthedUser | undefined = undefined
    try {
      authUser = await lookupUser(await parseCredentials(req))
    } catch (e) {
      if (authRequired) next(e)
    }

    const props = {
      ...(method === 'GET' ? req.query : req.body),
      ...req.params,
    }

    const logs = getLogs(req)

    try {
      const result = await handler(
        validate(propSchema, props),
        authUser as AuthedUser,
        logs,
        res
      )

      if (!res.headersSent) {
        // Convert bigint to number, b/c JSON doesn't support bigint.
        const convertedResult = deepConvertBigIntToNumber(result)

        res.status(200).json(convertedResult ?? { success: true })
      }
    } catch (e) {
      logs.logError('Error in api endpoint', { error: e })
      next(e)
    }
  }
}

const deepConvertBigIntToNumber = (obj: any): any => {
  if (typeof obj === 'bigint') {
    return Number(obj)
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      obj[key] = deepConvertBigIntToNumber(value)
    }
  }
  return obj
}
