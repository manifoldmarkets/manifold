import { auth } from './users'
import { ENV_CONFIG } from 'common/envs/constants'
import { V2CloudFunction } from 'common/envs/prod'

export class APIError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'APIError'
  }
}

export async function call(url: string, method: string, params: any) {
  const user = auth.currentUser
  if (user == null) {
    throw new Error('Must be signed in to make API calls.')
  }
  const token = await user.getIdToken()
  const req = new Request(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: method,
    body: JSON.stringify(params),
  })
  return await fetch(req).then(async (resp) => {
    const json = (await resp.json()) as { [k: string]: any }
    if (!resp.ok) {
      throw new APIError(resp.status, json?.message)
    }
    return json
  })
}

// Our users access the API through the Vercel proxy routes at /api/v0/blah,
// but right now at least until we get performance under control let's have the
// app just hit the cloud functions directly -- there's no difference and it's
// one less hop

export function getFunctionUrl(name: V2CloudFunction) {
  return ENV_CONFIG.functionEndpoints[name]
}

export function createMarket(params: any) {
  return call(getFunctionUrl('createmarket'), 'POST', params)
}

export function placeBet(params: any) {
  return call(getFunctionUrl('placebet'), 'POST', params)
}

export function sellShares(params: any) {
  return call(getFunctionUrl('sellshares'), 'POST', params)
}

export function sellBet(params: any) {
  return call(getFunctionUrl('sellbet'), 'POST', params)
}
