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
    // console.error('calling authy api without auth')
    // If the api is authed and the user is not loaded, wait for the user to load.
    let i = 0
    while (!auth.currentUser) {
      i++
      await sleep(i * 10)
      if (i > 5) {
        console.error('User did not load after 5 iterations')
        break
      }
    }
  }
  return (await callWithAuth(
    formatApiUrlWithParams(path, params),
    pathProps.method,
    auth,
    params
  )) as Promise<APIResponse<P>>
}
