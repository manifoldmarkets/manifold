import * as admin from 'firebase-admin'
import { z } from 'zod'
import { Request, Response, NextFunction } from 'express'

import { PrivateUser } from 'common/user'
import { APIError } from 'common//api/utils'
import { StructuredLogger, getLogger } from 'shared/log'
export { APIError } from 'common//api/utils'
import * as crypto from 'crypto'
import {
  API,
  APIPath,
  APIResponseOptionalContinue,
  APISchema,
  ValidatedAPIParams,
} from 'common/api/schema'

export type Json = Record<string, unknown> | Json[]
export type JsonHandler<T extends Json> = (
  req: Request,
  log: StructuredLogger,
  logError: StructuredLogger,
  res: Response
) => Promise<T>
export type AuthedHandler<T extends Json> = (
  req: Request,
  user: AuthedUser,
  log: StructuredLogger,
  logError: StructuredLogger,
  res: Response
) => Promise<T>
export type MaybeAuthedHandler<T extends Json> = (
  req: Request,
  user: AuthedUser | undefined,
  log: StructuredLogger,
  logError: StructuredLogger,
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
    throw new APIError(400, 'Error validating request.', issues)
  } else {
    return result.data as z.infer<T>
  }
}

export const jsonEndpoint = <T extends Json>(fn: JsonHandler<T>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const logger = requestLogger(req)
      res.status(200).json(await fn(req, logger.debug, logger.error, res))
    } catch (e) {
      next(e)
    }
  }
}

const requestLogger = (req: Request) => {
  const traceContext = req.get('X-Cloud-Trace-Context')
  const traceId = traceContext
    ? traceContext.split('/')[0]
    : crypto.randomUUID()
  return getLogger({ endpoint: req.path, traceId })
}

export const getDummyLogs = (endpoint: string) => {
  const traceId = crypto.randomUUID()
  return getLogger({ endpoint, traceId })
}

export const authEndpoint = <T extends Json>(fn: AuthedHandler<T>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authedUser = await lookupUser(await parseCredentials(req))
      const logger = requestLogger(req)
      res
        .status(200)
        .json(await fn(req, authedUser, logger.debug, logger.error, res))
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
      const logger = requestLogger(req)
      res
        .status(200)
        .json(await fn(req, authUser, logger.debug, logger.error, res))
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
  { log, logError }: { log: StructuredLogger; logError: StructuredLogger }
) => Promise<APIResponseOptionalContinue<N>>

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

    const logger = requestLogger(req)

    try {
      const resultOptionalContinue = await handler(
        validate(propSchema, props),
        authUser as AuthedUser,
        { log: logger.debug, logError: logger.error }
      )

      const hasContinue =
        resultOptionalContinue &&
        'continue' in resultOptionalContinue &&
        'result' in resultOptionalContinue
      const result = hasContinue
        ? resultOptionalContinue.result
        : resultOptionalContinue

      if (!res.headersSent) {
        // Convert bigint to number, b/c JSON doesn't support bigint.
        const convertedResult = deepConvertBigIntToNumber(result)

        res.status(200).json(convertedResult ?? { success: true })
      }

      if (hasContinue) {
        await resultOptionalContinue.continue()
      }
    } catch (error) {
      logger.error(error)
      next(error)
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
