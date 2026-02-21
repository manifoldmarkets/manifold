import { API, APIParams, APIPath, APIResponse } from 'common/api/schema'
import { APIError, ErrorCode, getApiUrl } from 'common/api/utils'
import { forEach } from 'lodash'
import { removeUndefinedProps } from 'common/util/object'
import { User } from 'firebase/auth'

// LOCAL_ONLY mode: set a user ID that will be sent as X-Local-User header.
// Initialize from env var to avoid race conditions with async auth setup.
let localOnlyUserId: string | null =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_LOCAL_TEST_USER_ID
    ? process.env.NEXT_PUBLIC_LOCAL_TEST_USER_ID
    : null
export function setLocalOnlyUserId(userId: string | null) {
  localOnlyUserId = userId
}

export function unauthedApi<P extends APIPath>(path: P, params: APIParams<P>) {
  return baseApiCall(
    formatApiUrlWithParams(path, params),
    API[path].method,
    params,
    null
  ) as Promise<APIResponse<P>>
}

export const formatApiUrlWithParams = (
  path: APIPath,
  params: APIParams<APIPath>
) => {
  // parse any params that should part of the path (like market/:id)
  let url = getApiUrl(path)
  forEach(params, (v, k) => {
    if (url.includes(`:${k}`)) {
      url = url.replace(`:${k}`, v + '')
      delete (params as any)[k]
    }
  })
  return url
}

function appendQuery(url: string, props: Record<string, any>) {
  const [base, query] = url.split(/\?(.+)/)
  const params = new URLSearchParams(query)
  forEach(removeUndefinedProps(props ?? {}), (v, k) => {
    if (Array.isArray(v)) {
      v.forEach((item) => params.append(k + '[]', item))
    } else {
      params.set(k, v)
    }
  })
  return `${base}?${params.toString()}`
}

export async function baseApiCall(
  url: string,
  method: 'POST' | 'PUT' | 'GET',
  params: any,
  user: User | null
) {
  const actualUrl = method === 'POST' ? url : appendQuery(url, params)
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  if (localOnlyUserId) {
    headers['X-Local-User'] = localOnlyUserId
  } else if (user) {
    const token = await user.getIdToken()
    headers.Authorization = `Bearer ${token}`
  }
  const req = new Request(actualUrl, {
    headers,
    method: method,
    body:
      params == null || method === 'GET' ? undefined : JSON.stringify(params),
  })
  return fetch(req).then(async (resp) => {
    const json = (await resp.json()) as { [k: string]: any }
    if (!resp.ok) {
      throw new APIError(resp.status as ErrorCode, json?.message, json?.details)
    }
    return json
  })
}
