// log levels GCP's log explorer recognizes
export const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
type GCPLogLevel = typeof LEVELS[number]

type GCPLogOutput = {
  severity: GCPLogLevel
  message?: string
  details: any[]
}

export function log(severity: GCPLogLevel, message: any, details?: object) {
  const output = { severity, message: message ?? null, ...(details ?? {}) }
  console.log(JSON.stringify(output))
}

log.debug = (message: any, details?: object) => log('DEBUG', message, details)
log.info = (message: any, details?: object) => log('INFO', message, details)
log.warn = (message: any, details?: object) => log('WARNING', message, details)
log.error = (message: any, details?: object) => log('ERROR', message, details)
