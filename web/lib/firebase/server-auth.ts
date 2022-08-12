import fetch from 'node-fetch'
import { IncomingMessage, ServerResponse } from 'http'
import { FIREBASE_CONFIG, PROJECT_ID } from 'common/envs/constants'
import { getFunctionUrl } from 'common/api'
import { UserCredential } from 'firebase/auth'
import {
  getTokensFromCookies,
  setTokenCookies,
  deleteTokenCookies,
} from './auth'
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
  console.debug('Initialized Firebase auth libraries.')

  let { id, refresh, custom } = getTokensFromCookies(ctx.req)

  // step 0: if you have no refresh token you are logged out
  if (refresh == null) {
    console.debug('User is unauthenticated.')
    return undefined
  }

  console.debug('User may be authenticated; checking cookies.')

  // step 1: given a valid refresh token, ensure a valid ID token
  if (id != null) {
    // if they have an ID token, throw it out if it's invalid/expired
    try {
      await adminAuth.verifyIdToken(id)
      console.debug('Verified ID token.')
    } catch {
      id = undefined
      console.debug('Invalid existing ID token.')
    }
  }
  if (id == null) {
    // ask for a new one from google using the refresh token
    try {
      const resp = await requestFirebaseIdToken(refresh)
      console.debug('Obtained fresh ID token from Firebase.')
      id = resp.id_token
      refresh = resp.refresh_token
    } catch (e) {
      // big unexpected problem -- functionally, they are not logged in
      console.error(e)
      return undefined
    }
  }

  // step 2: given a valid ID token, ensure a valid custom token, and sign in
  // to the client SDK with the custom token
  if (custom != null) {
    // sign in with this token, or throw it out if it's invalid/expired
    try {
      const creds = await signInWithCustomToken(clientAuth, custom)
      console.debug('Signed in with custom token.')
      return { creds, id, refresh, custom }
    } catch {
      custom = undefined
      console.debug('Invalid existing custom token.')
    }
  }
  if (custom == null) {
    // ask for a new one from our cloud functions using the ID token, then sign in
    try {
      const resp = await requestManifoldCustomToken(id)
      console.debug('Obtained fresh custom token from backend.')
      custom = resp.token
      const creds = await signInWithCustomToken(clientAuth, custom)
      console.debug('Signed in with custom token.')
      return { creds, id, refresh, custom }
    } catch (e) {
      // big unexpected problem -- functionally, they are not logged in
      console.error(e)
      return undefined
    }
  }
}

export const authenticateOnServer = async (ctx: RequestContext) => {
  console.debug('Server authentication sequence starting.')
  const tokens = await authAndRefreshTokens(ctx)
  console.debug('Finished checking and refreshing tokens.')
  const creds = tokens?.creds
  try {
    if (tokens == null) {
      deleteTokenCookies(ctx.res)
      console.debug('Not logged in; cleared token cookies.')
    } else {
      setTokenCookies(tokens, ctx.res)
      console.debug('Logged in; set current token cookies.')
    }
  } catch (e) {
    // definitely not supposed to happen, but let's be maximally robust
    console.error(e)
  }
  return creds
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
      if (fn == null) {
        return { props: {} }
      } else {
        const props = fn(ctx)
        console.debug('Finished getting initial props for rendering.')
        return props
      }
    } else {
      console.debug(`Redirecting to ${dest}.`)
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
      console.debug(`Redirecting to ${dest}.`)
      return { redirect: { destination: dest, permanent: false } }
    } else {
      if (fn == null) {
        return { props: {} }
      } else {
        const props = fn(ctx, creds)
        console.debug('Finished getting initial props for rendering.')
        return props
      }
    }
  }
}
