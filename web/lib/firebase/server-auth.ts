import fetch from 'node-fetch'
import { IncomingMessage, ServerResponse } from 'http'
import { FIREBASE_CONFIG, PROJECT_ID } from 'common/envs/constants'
import { getFunctionUrl } from 'common/api'
import { UserCredential } from 'firebase/auth'
import { getAuthCookies, setAuthCookies, deleteAuthCookies } from './auth'
import {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
} from 'next'

// server firebase SDK
import * as admin from 'firebase-admin'

// client firebase SDK
import { app as clientApp } from './init'
import { getAuth, signInWithCustomToken } from 'firebase/auth'

const ensureApp = async () => {
  // Note: firebase-admin can only be imported from a server context,
  // because it relies on Node standard library dependencies.
  if (admin.apps.length === 0) {
    // never initialize twice
    return admin.initializeApp({ projectId: PROJECT_ID })
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return admin.apps[0]!
}

const requestFirebaseIdToken = async (refreshToken: string) => {
  // See https://firebase.google.com/docs/reference/rest/auth/#section-refresh-token
  const refreshUrl = new URL('https://securetoken.googleapis.com/v1/token')
  refreshUrl.searchParams.append('key', FIREBASE_CONFIG.apiKey)
  const result = await fetch(refreshUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!result.ok) {
    throw new Error(`Could not refresh ID token: ${await result.text()}`)
  }
  return (await result.json()) as { id_token: string; refresh_token: string }
}

const requestManifoldCustomToken = async (idToken: string) => {
  const functionUrl = getFunctionUrl('getcustomtoken')
  const result = await fetch(functionUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  })
  if (!result.ok) {
    throw new Error(`Could not get custom token: ${await result.text()}`)
  }
  return (await result.json()) as { token: string }
}

type RequestContext = {
  req: IncomingMessage
  res: ServerResponse
}

const authAndRefreshTokens = async (ctx: RequestContext) => {
  const adminAuth = (await ensureApp()).auth()
  const clientAuth = getAuth(clientApp)
  let { idToken, refreshToken, customToken } = getAuthCookies(ctx.req)

  // step 0: if you have no refresh token you are logged out
  if (refreshToken == null) {
    return undefined
  }

  // step 1: given a valid refresh token, ensure a valid ID token
  if (idToken != null) {
    // if they have an ID token, throw it out if it's invalid/expired
    try {
      await adminAuth.verifyIdToken(idToken)
    } catch {
      idToken = undefined
    }
  }
  if (idToken == null) {
    // ask for a new one from google using the refresh token
    try {
      const resp = await requestFirebaseIdToken(refreshToken)
      idToken = resp.id_token
      refreshToken = resp.refresh_token
    } catch (e) {
      // big unexpected problem -- functionally, they are not logged in
      console.error(e)
      return undefined
    }
  }

  // step 2: given a valid ID token, ensure a valid custom token, and sign in
  // to the client SDK with the custom token
  if (customToken != null) {
    // sign in with this token, or throw it out if it's invalid/expired
    try {
      return {
        creds: await signInWithCustomToken(clientAuth, customToken),
        idToken,
        refreshToken,
        customToken,
      }
    } catch {
      customToken = undefined
    }
  }
  if (customToken == null) {
    // ask for a new one from our cloud functions using the ID token, then sign in
    try {
      const resp = await requestManifoldCustomToken(idToken)
      customToken = resp.token
      return {
        creds: await signInWithCustomToken(clientAuth, customToken),
        idToken,
        refreshToken,
        customToken,
      }
    } catch (e) {
      // big unexpected problem -- functionally, they are not logged in
      console.error(e)
      return undefined
    }
  }
}

export const authenticateOnServer = async (ctx: RequestContext) => {
  const tokens = await authAndRefreshTokens(ctx)
  if (tokens == null) {
    deleteAuthCookies()
    return undefined
  } else {
    const { creds, idToken, refreshToken, customToken } = tokens
    setAuthCookies(idToken, refreshToken, customToken, ctx.res)
    return creds
  }
}

// note that we might want to define these types more generically if we want better
// type safety on next.js stuff... see the definition of GetServerSideProps

type GetServerSidePropsAuthed<P> = (
  context: GetServerSidePropsContext,
  creds: UserCredential
) => Promise<GetServerSidePropsResult<P>>

export const redirectIfLoggedIn = <P>(
  dest: string,
  fn?: GetServerSideProps<P>
) => {
  return async (ctx: GetServerSidePropsContext) => {
    const creds = await authenticateOnServer(ctx)
    if (creds == null) {
      return fn != null ? await fn(ctx) : { props: {} }
    } else {
      return { redirect: { destination: dest, permanent: false } }
    }
  }
}

export const redirectIfLoggedOut = <P>(
  dest: string,
  fn?: GetServerSidePropsAuthed<P>
) => {
  return async (ctx: GetServerSidePropsContext) => {
    const creds = await authenticateOnServer(ctx)
    if (creds == null) {
      return { redirect: { destination: dest, permanent: false } }
    } else {
      return fn != null ? await fn(ctx, creds) : { props: {} }
    }
  }
}
