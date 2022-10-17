import { IncomingMessage, ServerResponse } from 'http'
import { User as FirebaseUser } from 'firebase/auth'
import { AUTH_COOKIE_NAME } from 'common/envs/constants'
import { getCookies } from 'web/lib/util/cookie'
import {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
} from 'next'

// client firebase SDK
import { app as clientApp } from './init'

import { setFirebaseUserViaJson } from 'common/firebase-auth'

type RequestContext = {
  req: IncomingMessage
  res: ServerResponse
}

// The Firebase SDK doesn't really support persisting the logged-in state between
// devices, or anything like that. To get it from the client to the server:
//
// 1. We pack up the user by calling (the undocumented) User.toJSON(). This is the
//    same way the Firebase SDK saves it to disk, so it's gonna have the right stuff.
//
// 2. We put it into a cookie and read the cookie out here.
//
// 3. We use the Firebase "persistence manager" to write the cookie value into the persistent
//    store on the server (an in-memory store), just as if the SDK had saved the user itself.
//
// 4. We ask the persistence manager for the current user, which reads what we just wrote,
//    and creates a real puffed-up internal user object from the serialized user.
//
// 5. We set that user to be the current Firebase user in the SDK.
//
// 6. We ask for the ID token, which will refresh it if necessary (i.e. if this cookie
//    is from an old browser session), so that we know the SDK is prepared to do real
//    Firebase queries.
//
// This strategy should be robust, since it's repurposing Firebase's internal persistence
// machinery, but the details may eventually need updating for new versions of the SDK.
//
// References:
// Persistence manager: https://github.com/firebase/firebase-js-sdk/blob/39f4635ebc07316661324145f1b8c27f9bd7aedb/packages/auth/src/core/persistence/persistence_user_manager.ts#L64
// Token manager: https://github.com/firebase/firebase-js-sdk/blob/39f4635ebc07316661324145f1b8c27f9bd7aedb/packages/auth/src/core/user/token_manager.ts#L76

export const authenticateOnServer = async (ctx: RequestContext) => {
  const user = getCookies(ctx.req.headers.cookie ?? '')[AUTH_COOKIE_NAME]
  if (user == null) {
    console.debug('User is unauthenticated.')
    return null
  }
  const deserializedUser = JSON.parse(user)
  return setFirebaseUserViaJson(deserializedUser, clientApp)
}

// note that we might want to define these types more generically if we want better
// type safety on next.js stuff... see the definition of GetServerSideProps

type GetServerSidePropsAuthed<P> = (
  context: GetServerSidePropsContext,
  creds: FirebaseUser
) => Promise<GetServerSidePropsResult<P>>

export const redirectIfLoggedIn = <P extends { [k: string]: any }>(
  dest: string,
  fn?: GetServerSideProps<P>
) => {
  return async (ctx: GetServerSidePropsContext) => {
    const creds = await authenticateOnServer(ctx)
    if (creds == null) {
      if (fn == null) {
        return { props: {} }
      } else {
        const props = await fn(ctx)
        console.debug('Finished getting initial props for rendering.')
        return props
      }
    } else {
      console.debug(`Redirecting to ${dest}.`)
      return { redirect: { destination: dest, permanent: false } }
    }
  }
}

export const redirectIfLoggedOut = <P extends { [k: string]: any }>(
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
        const props = await fn(ctx, creds)
        console.debug('Finished getting initial props for rendering.')
        return props
      }
    }
  }
}
