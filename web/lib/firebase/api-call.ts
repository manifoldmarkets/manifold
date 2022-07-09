import { auth } from './users'
import { ENV_CONFIG } from 'common/envs/constants'

export class APIError extends Error {
  code: number
  details?: string
  constructor(code: number, message: string, details?: string) {
    super(message)
    this.code = code
    this.name = 'APIError'
    this.details = details
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
      throw new APIError(resp.status, json?.message, json?.details)
    }
    return json
  })
}

// Our users access the API through the Vercel proxy routes at /api/v0/blah,
// but right now at least until we get performance under control let's have the
// app just hit the cloud functions directly -- there's no difference and it's
// one less hop

export function getFunctionUrl(name: string) {
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
    const { projectId, region } = ENV_CONFIG.firebaseConfig
    return `http://localhost:5001/${projectId}/${region}/${name}`
  } else {
    const { cloudRunId, cloudRunRegion } = ENV_CONFIG
    return `https://${name}-${cloudRunId}-${cloudRunRegion}.a.run.app`
  }
}

export function createAnswer(params: any) {
  return call(getFunctionUrl('createanswer'), 'POST', params)
}

export function changeUserInfo(params: any) {
  return call(getFunctionUrl('changeuserinfo'), 'POST', params)
}

export function addLiquidity(params: any) {
  return call(getFunctionUrl('addliquidity'), 'POST', params)
}

export function withdrawLiquidity(params: any) {
  return call(getFunctionUrl('withdrawliquidity'), 'POST', params)
}

export function createMarket(params: any) {
  return call(getFunctionUrl('createmarket'), 'POST', params)
}

export function resolveMarket(params: any) {
  return call(getFunctionUrl('resolvemarket'), 'POST', params)
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

export function claimManalink(params: any) {
  return call(getFunctionUrl('claimmanalink'), 'POST', params)
}

export function createGroup(params: any) {
  return call(getFunctionUrl('creategroup'), 'POST', params)
}

export function requestBonuses(params: any) {
  return call(getFunctionUrl('getdailybonuses'), 'POST', params)
}
