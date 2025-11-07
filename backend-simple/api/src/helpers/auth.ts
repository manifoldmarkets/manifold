import { Request } from 'express'
import * as admin from 'firebase-admin'

// Initialize Firebase Admin SDK
let firebaseInitialized = false

export function initializeFirebase() {
  if (firebaseInitialized) return

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  })

  firebaseInitialized = true
  console.log('✅ Firebase Admin SDK initialized')
}

// Types
export type AuthedUser = {
  uid: string
  creds: JwtCredentials | KeyCredentials
}

type JwtCredentials = {
  kind: 'jwt'
  data: admin.auth.DecodedIdToken
}

type KeyCredentials = {
  kind: 'key'
  data: string
  userId: string
}

type Credentials = JwtCredentials | KeyCredentials

// Error class
export class APIError extends Error {
  constructor(public code: number, message: string) {
    super(message)
    this.name = 'APIError'
  }
}

// Parse Authorization header
export async function parseCredentials(req: Request): Promise<Credentials> {
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
    case 'Bearer': {
      if (payload === 'undefined' || !payload) {
        throw new APIError(401, 'Firebase JWT payload undefined.')
      }

      try {
        const auth = admin.auth()
        const decodedToken = await auth.verifyIdToken(payload)
        return { kind: 'jwt', data: decodedToken }
      } catch (err) {
        console.error('Error verifying Firebase JWT:', err)
        throw new APIError(401, 'Invalid or expired token.')
      }
    }

    case 'Key': {
      // API Key authentication
      // For MVP, we'll just validate format
      // In production, check against database
      if (!payload || payload.length < 10) {
        throw new APIError(401, 'Invalid API key.')
      }

      // TODO: Look up user from private_users table by api_secret
      // For now, return a placeholder
      return {
        kind: 'key',
        data: payload,
        userId: 'key-user-id', // Replace with actual DB lookup
      }
    }

    default:
      throw new APIError(401, 'Invalid auth scheme; must be "Key" or "Bearer".')
  }
}

// Get authenticated user from credentials
export async function lookupUser(creds: Credentials): Promise<AuthedUser> {
  switch (creds.kind) {
    case 'jwt': {
      if (typeof creds.data.user_id !== 'string') {
        throw new APIError(401, 'JWT must contain user ID.')
      }
      return { uid: creds.data.user_id, creds }
    }

    case 'key': {
      // For API key auth, userId is already resolved
      return { uid: creds.userId, creds }
    }

    default:
      throw new APIError(401, 'Invalid credential type.')
  }
}

// Authenticate request - combines both steps
export async function authenticateRequest(req: Request): Promise<AuthedUser> {
  const creds = await parseCredentials(req)
  return lookupUser(creds)
}
