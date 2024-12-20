import { APIPath } from 'common/api/schema'
import { APIParams } from 'common/api/schema'
import { callWithAuth, apiWithAuth } from 'client-common/lib/api'
import { auth } from 'lib/init'

export async function call(
  url: string,
  method: 'POST' | 'PUT' | 'GET',
  params?: any
) {
  return callWithAuth(url, method, auth, params)
}
export async function api<P extends APIPath>(
  path: P,
  params: APIParams<P> = {}
) {
  return apiWithAuth(path, auth, params)
}
