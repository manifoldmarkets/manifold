import * as admin from 'firebase-admin'
import { z } from 'zod'
import { Request, RequestHandler, Response } from 'express'
import { error } from 'firebase-functions/logger'
import { HttpsOptions } from 'firebase-functions/v2/https'

import { log } from 'shared/utils'
import { APIError } from 'common/api'
import { PrivateUser } from 'common/user'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
  CORS_ORIGIN_VERCEL,
} from 'common/envs/constants'
export { APIError } from 'common/api'

type Output = Record<string, unknown>
export type AuthedUser = {
  uid: string
  creds: JwtCredentials | (KeyCredentials & { privateUser: PrivateUser })
}
type Handler = (req: Request, user: AuthedUser) => Promise<Output>
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
      try {
        return { kind: 'jwt', data: await auth.verifyIdToken(payload) }
      } catch (err) {
        // This is somewhat suspicious, so get it into the firebase console
        error('Error verifying Firebase JWT: ', err)
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

export const writeResponseError = (e: unknown, res: Response) => {
  if (e instanceof APIError) {
    const output: { [k: string]: unknown } = { message: e.message }
    if (e.details != null) {
      output.details = e.details
    }
    res.status(e.code).json(output)
  } else {
    error(e)
    res.status(500).json({ message: 'An unknown error occurred.' })
  }
}

export const zTimestamp = () => {
  return z.preprocess((arg) => {
    return typeof arg == 'number' ? new Date(arg) : undefined
  }, z.date())
}

export type EndpointDefinition = {
  opts: EndpointOptions & { method: string }
  handler: RequestHandler
}

export const validate = <T extends z.ZodTypeAny>(schema: T, val: unknown) => {
  const result = schema.safeParse(val)
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      // TODO: export this type for the front-end to parse
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

export interface EndpointOptions extends HttpsOptions {
  method?: string
  secrets?: string[]
}

const DEFAULT_OPTS = {
  method: 'POST',
  minInstances: 1,
  concurrency: 100,
  memory: '2GiB',
  cpu: 1,
  cors: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_VERCEL, CORS_ORIGIN_LOCALHOST],
  secrets: ['MAILGUN_KEY', 'SUPABASE_KEY', 'API_SECRET'],
}

export const newEndpoint = (endpointOpts: EndpointOptions, fn: Handler) => {
  const opts = Object.assign({}, DEFAULT_OPTS, endpointOpts)
  return {
    opts,
    handler: async (req: Request, res: Response) => {
      log(`${req.method} ${req.url} ${JSON.stringify(req.body)}`)
      try {
        if (opts.method !== req.method) {
          throw new APIError(405, `This endpoint supports only ${opts.method}.`)
        }
        const authedUser = await lookupUser(await parseCredentials(req))
        res.status(200).json(await fn(req, authedUser))
      } catch (e) {
        writeResponseError(e, res)
      }
    },
  } as EndpointDefinition
}

export const newEndpointNoAuth = (
  endpointOpts: EndpointOptions,
  fn: (req: Request) => Promise<Output>
) => {
  const opts = Object.assign({}, DEFAULT_OPTS, endpointOpts)
  return {
    opts,
    handler: async (req: Request, res: Response) => {
      log(`${req.method} ${req.url} ${JSON.stringify(req.body)}`)
      try {
        if (opts.method !== req.method) {
          throw new APIError(405, `This endpoint supports only ${opts.method}.`)
        }
        res.status(200).json(await fn(req))
      } catch (e) {
        writeResponseError(e, res)
      }
    },
  } as EndpointDefinition
}
