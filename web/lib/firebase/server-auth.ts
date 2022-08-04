import * as admin from 'firebase-admin'
import fetch from 'node-fetch'
import { IncomingMessage, ServerResponse } from 'http'
import { FIREBASE_CONFIG, PROJECT_ID } from 'common/envs/constants'
import { getAuthCookies, setAuthCookies } from './auth'
import { GetServerSideProps, GetServerSidePropsContext } from 'next'

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
  return (await result.json()) as any
}

type RequestContext = {
  req: IncomingMessage
  res: ServerResponse
}

export const getServerAuthenticatedUid = async (ctx: RequestContext) => {
  const app = await ensureApp()
  const auth = app.auth()
  const { idToken, refreshToken } = getAuthCookies(ctx.req)

  // If we have a valid ID token, verify the user immediately with no network trips.
  // If the ID token doesn't verify, we'll have to refresh it to see who they are.
  // If they don't have any tokens, then we have no idea who they are.
  if (idToken != null) {
    try {
      return (await auth.verifyIdToken(idToken))?.uid
    } catch {
      // plausibly expired; try the refresh token, if it's present
    }
  }
  if (refreshToken != null) {
    try {
      const resp = await requestFirebaseIdToken(refreshToken)
      setAuthCookies(resp.id_token, resp.refresh_token, ctx.res)
      return (await auth.verifyIdToken(resp.id_token))?.uid
    } catch (e) {
      // this is a big unexpected problem -- either their cookies are corrupt
      // or the refresh token API is down. functionally, they are not logged in
      console.error(e)
    }
  }
  return undefined
}

export const redirectIfLoggedIn = (dest: string, fn?: GetServerSideProps) => {
  return async (ctx: GetServerSidePropsContext) => {
    const uid = await getServerAuthenticatedUid(ctx)
    if (uid == null) {
      return fn != null ? await fn(ctx) : { props: {} }
    } else {
      return { redirect: { destination: dest, permanent: false } }
    }
  }
}

export const redirectIfLoggedOut = (dest: string, fn?: GetServerSideProps) => {
  return async (ctx: GetServerSidePropsContext) => {
    const uid = await getServerAuthenticatedUid(ctx)
    if (uid == null) {
      return { redirect: { destination: dest, permanent: false } }
    } else {
      return fn != null ? await fn(ctx) : { props: {} }
    }
  }
}
