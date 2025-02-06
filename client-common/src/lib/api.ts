import { API, APIParams, APIPath, APIResponse } from 'common/api/schema'
import { baseApiCall, formatApiUrlWithParams } from 'common/util/api'
import { sleep } from 'common/util/time'
import { Auth } from 'firebase/auth'
export { APIError } from 'common/api/utils'

export async function callWithAuth(
  url: string,
  method: 'POST' | 'PUT' | 'GET',
  auth: Auth,
  params?: any
) {
  return baseApiCall(url, method, params, auth.currentUser)
}

export type apiWithoutAuth<P extends APIPath> = (
  path: P,
  params: APIParams<P>
) => Promise<APIResponse<P>>

// This is the preferred way of using the api going forward
export async function apiWithAuth<P extends APIPath>(
  path: P,
  auth: Auth,
  params: APIParams<P> = {}
) {
  const pathProps = API[path]
  const preferAuth = 'preferAuth' in pathProps && pathProps.preferAuth
  if (!auth.currentUser && (preferAuth || pathProps.authed)) {
    // For both preferred and required auth, we need to know if we're still loading
    await new Promise<void>((resolve) => {
      // We only need to wait for the first auth state change to know if we're logged in or not
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe()
        resolve()
      })
    })

    if (!auth.currentUser && pathProps.authed) {
      console.error('Authentication required but user is not signed in')
    }
  }

  return (await callWithAuth(
    formatApiUrlWithParams(path, params),
    pathProps.method,
    auth,
    params
  )) as Promise<APIResponse<P>>
}
