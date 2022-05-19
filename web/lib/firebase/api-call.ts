import { auth } from './users'
import { app, functions } from './init'

export class APIError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'APIError'
  }
}

export async function call(name: string, method: string, params: any) {
  const user = auth.currentUser
  if (user == null) {
    throw new Error('Must be signed in to make API calls.')
  }
  const token = await user.getIdToken()
  const region = functions.region
  const projectId = app.options.projectId
  const url = `https://${region}-${projectId}.cloudfunctions.net/${name}`
  const req = new Request(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: method,
    body: JSON.stringify({ data: params }),
  })
  return await fetch(req).then(async (resp) => {
    const json = (await resp.json()) as { [k: string]: any }
    if (json.data.status == 'error') {
      throw new APIError(resp.status, json.data.message)
    }
    return json.data
  })
}

export function createContract(params: any) {
  return call('createContract', 'POST', params)
}

export function placeBet(params: any) {
  return call('placeBet', 'POST', params)
}
