import { ENV_CONFIG } from 'common/envs/constants'
import { API, APIPath } from './schema'

type ErrorCode =
  | 400 // your input is bad (like zod is mad)
  | 401 // you aren't logged in / your account doesn't exist
  | 403 // you aren't allowed to do it
  | 404 // we can't find it
  | 500 // we fucked up

export class APIError extends Error {
  code: ErrorCode
  details?: unknown
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.code = code
    this.name = 'APIError'
    this.details = details
  }
}

export function getCloudRunServiceUrl(name: string) {
  const { cloudRunId, cloudRunRegion } = ENV_CONFIG
  return `https://${name}-${cloudRunId}-${cloudRunRegion}.a.run.app`
}

// Note that the replicator is deployed to us-east4 to be close to Supabase
export function getReplicatorUrl() {
  // cloud run region is us-east4: 'uk'
  const { cloudRunId } = ENV_CONFIG
  return `https://supabase-replicator-${cloudRunId}-uk.a.run.app`
}

export function pathWithPrefix(path: APIPath) {
  return API[path].visibility === 'public' ? `v0/${path}` : path
}

// TODO: strictly type
export function getApiUrl(path: string) {
  if (path in API) {
    path = pathWithPrefix(path as APIPath)
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL}/${path}`
  } else {
    const { apiEndpoint } = ENV_CONFIG
    return `${apiEndpoint}/${path}`
  }
}
