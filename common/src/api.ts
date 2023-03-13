import { ENV_CONFIG } from './envs/constants'

export class APIError extends Error {
  code: number
  details?: unknown
  constructor(code: number, message: string, details?: unknown) {
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

export function getApiUrl(name: string) {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL}/${name}`
  } else {
    return `${getCloudRunServiceUrl('api')}/${name}`
  }
}
