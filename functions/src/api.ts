import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions/v2'
import { HttpsOptions, onRequest, Request } from 'firebase-functions/v2/https'
import { log } from './utils'
import { z } from 'zod'

import { PrivateUser } from '../../common/user'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from '../../common/envs/constants'

type Output = Record<string, unknown>
type AuthedUser = {
  uid: string
  creds: JwtCredentials | (KeyCredentials & { privateUser: PrivateUser })
}
type Handler = (req: Request, user: AuthedUser) => Promise<Output>
type JwtCredentials = { kind: 'jwt'; data: admin.auth.DecodedIdToken }
type KeyCredentials = { kind: 'key'; data: string }
type Credentials = JwtCredentials | KeyCredentials

export class APIError {
  code: number
  msg: string
  details: unknown
  constructor(code: number, msg: string, details?: unknown) {
    this.code = code
    this.msg = msg
    this.details = details
  }
}

const auth = admin.auth()
const firestore = admin.firestore()
const privateUsers = firestore.collection(
  'private-users'
) as admin.firestore.CollectionReference<PrivateUser>

export const parseCredentials = async (req: Request): Promise<Credentials> => {
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
        logger.error('Error verifying Firebase JWT: ', err)
        throw new APIError(403, 'Error validating token.')
      }
    case 'Key':
      return { kind: 'key', data: payload }
    default:
      throw new APIError(403, 'Invalid auth scheme; must be "Key" or "Bearer".')
  }
}

export const lookupUser = async (creds: Credentials): Promise<AuthedUser> => {
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
      const privateUser = privateUserQ.docs[0].data()
      return { uid: privateUser.id, creds: { privateUser, ...creds } }
    }
    default:
      throw new APIError(500, 'Invalid credential type.')
  }
}

export const zTimestamp = () => {
  return z.preprocess((arg) => {
    return typeof arg == 'number' ? new Date(arg) : undefined
  }, z.date())
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

const DEFAULT_OPTS: HttpsOptions = {
  minInstances: 1,
  cors: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
}

export const newEndpoint = (methods: [string], fn: Handler) =>
  onRequest(DEFAULT_OPTS, async (req, res) => {
    log('Request processing started.')
    try {
      if (!methods.includes(req.method)) {
        const allowed = methods.join(', ')
        throw new APIError(405, `This endpoint supports only ${allowed}.`)
      }
      const authedUser = await lookupUser(await parseCredentials(req))
      log('User credentials processed.')
      res.status(200).json(await fn(req, authedUser))
    } catch (e) {
      if (e instanceof APIError) {
        const output: { [k: string]: unknown } = { message: e.msg }
        if (e.details != null) {
          output.details = e.details
        }
        res.status(e.code).json(output)
      } else {
        logger.error(e)
        res.status(500).json({ message: 'An unknown error occurred.' })
      }
    }
  })
