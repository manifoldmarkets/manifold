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
  } else if (process.env.NEXT_PUBLIC_FIREBASE_EMULATE) {
    const { projectId, region } = ENV_CONFIG.firebaseConfig
    return `http://localhost:5001/${projectId}/${region}/${name}`
  } else {
    const { cloudRunId, cloudRunRegion } = ENV_CONFIG
    return `https://${name}-${cloudRunId}-${cloudRunRegion}.a.run.app`
  }
}
