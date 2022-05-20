import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import * as Cors from 'cors'

import { User, PrivateUser } from 'common/user'

type Request = functions.https.Request
type Response = functions.Response
type Handler = (req: Request, res: Response) => Promise<any>
type AuthedUser = [User, PrivateUser]
type JwtCredentials = { kind: 'jwt'; data: admin.auth.DecodedIdToken }
type KeyCredentials = { kind: 'key'; data: string }
type Credentials = JwtCredentials | KeyCredentials

export class APIError {
  code: number
  msg: string
  constructor(code: number, msg: string) {
    this.code = code
    this.msg = msg
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
        if (!jwt.user_id) {
          throw new APIError(403, 'JWT must contain Manifold user ID.')
        }
        return { kind: 'jwt', data: jwt }
      } catch (err) {
        // This is somewhat suspicious, so get it into the firebase console
        functions.logger.error('Error verifying Firebase JWT: ', err)
        throw new APIError(403, `Error validating token: ${err}.`)
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

export const CORS_ORIGIN_MANIFOLD = /^https?:\/\/.+\.manifold\.markets$/
export const CORS_ORIGIN_LOCALHOST = /^http:\/\/localhost:\d+$/

export const applyCors = (req: any, res: any, params: object) => {
  return new Promise((resolve, reject) => {
    Cors(params)(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result)
      }
      return resolve(result)
    })
  })
}

export const newEndpoint = (methods: [string], fn: Handler) =>
  functions.runWith({ minInstances: 1 }).https.onRequest(async (req, res) => {
    await applyCors(req, res, {
      origins: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
      methods: methods,
    })
    try {
      if (!methods.includes(req.method)) {
        const allowed = methods.join(', ')
        throw new APIError(405, `This endpoint supports only ${allowed}.`)
      }
      res.status(200).json(await fn(req, res))
    } catch (e) {
      if (e instanceof APIError) {
        // Emit a 200 anyway here for now, for backwards compatibility
        res.status(e.code).json({ message: e.msg })
      } else {
        res.status(500).json({ message: 'An unknown error occurred.' })
      }
    }
  })
