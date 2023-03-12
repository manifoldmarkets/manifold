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

export function getFunctionUrl(name: string) {
  if (process.env.NEXT_PUBLIC_FUNCTIONS_URL) {
    return `${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/${name}`
  } else {
    const { cloudRunId, cloudRunRegion } = ENV_CONFIG
    return `https://api-${cloudRunId}-${cloudRunRegion}.a.run.app/${name}`
  }
}
