import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import * as Cors from 'cors'
import { z } from 'zod'

import { User, PrivateUser } from '../../common/user'
import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from '../../common/envs/constants'

type Output = Record<string, unknown>
type Request = functions.https.Request
type Response = functions.Response
type AuthedUser = [User, PrivateUser]
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
        const jwt = await admin.auth().verifyIdToken(payload)
        return { kind: 'jwt', data: jwt }
      } catch (err) {
        // This is somewhat suspicious, so get it into the firebase console
        functions.logger.error('Error verifying Firebase JWT: ', err)
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
  const users = firestore.collection('users')
  const privateUsers = firestore.collection('private-users')
  switch (creds.kind) {
    case 'jwt': {
      const { user_id } = creds.data
      if (typeof user_id !== 'string') {
        throw new APIError(403, 'JWT must contain Manifold user ID.')
      }
      const [userSnap, privateUserSnap] = await Promise.all([
        users.doc(user_id).get(),
        privateUsers.doc(user_id).get(),
      ])
      if (!userSnap.exists || !privateUserSnap.exists) {
        throw new APIError(403, 'No user exists with the provided ID.')
      }
      const user = userSnap.data() as User
      const privateUser = privateUserSnap.data() as PrivateUser
      return [user, privateUser]
    }
    case 'key': {
      const key = creds.data
      const privateUserQ = await privateUsers.where('apiKey', '==', key).get()
      if (privateUserQ.empty) {
        throw new APIError(403, `No private user exists with API key ${key}.`)
      }
      const privateUserSnap = privateUserQ.docs[0]
      const userSnap = await users.doc(privateUserSnap.id).get()
      if (!userSnap.exists) {
        throw new APIError(403, `No user exists with ID ${privateUserSnap.id}.`)
      }
      const user = userSnap.data() as User
      const privateUser = privateUserSnap.data() as PrivateUser
      return [user, privateUser]
    }
    default:
      throw new APIError(500, 'Invalid credential type.')
  }
}

export const applyCors = (
  req: Request,
  res: Response,
  params: Cors.CorsOptions
) => {
  return new Promise((resolve, reject) => {
    Cors(params)(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result)
      }
      return resolve(result)
    })
  })
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

export const newEndpoint = (methods: [string], fn: Handler) =>
  functions.runWith({ minInstances: 1 }).https.onRequest(async (req, res) => {
    try {
      await applyCors(req, res, {
        origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
        methods: methods,
      })
      if (!methods.includes(req.method)) {
        const allowed = methods.join(', ')
        throw new APIError(405, `This endpoint supports only ${allowed}.`)
      }
      const authedUser = await lookupUser(await parseCredentials(req))
      res.status(200).json(await fn(req, authedUser))
    } catch (e) {
      if (e instanceof APIError) {
        const output: { [k: string]: unknown } = { message: e.msg }
        if (e.details != null) {
          output.details = e.details
        }
        res.status(e.code).json(output)
      } else {
        functions.logger.error(e)
        res.status(500).json({ message: 'An unknown error occurred.' })
      }
    }
  })
