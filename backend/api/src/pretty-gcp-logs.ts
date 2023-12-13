import { blue, dim, red, yellow } from 'colors/safe'
import { omit } from 'lodash'
import { type GCPLogLevel } from 'shared/utils'
import { Transform, pipeline } from 'stream'

// partly written by chat gpt

class LogTransform extends Transform {
  constructor() {
    super({ objectMode: true })
  }

  _transform(chunk: any, _encoding: string, callback: () => void) {
    try {
      const logEntry = JSON.parse(chunk.toString())

      if (!logEntry.severity) {
        this.push(chunk.toString() + '\n') // If not a log entry, just print it
      } else {
        const { severity, endpoint, message, ...rest } = logEntry
        const formattedMessage = formatLogEntry(
          severity,
          endpoint,
          message,
          rest
        )
        this.push(formattedMessage + '\n')
      }
    } catch (e) {
      // If not json formatted, just print it. TODO: parse timestamp?
      this.push(chunk.toString() + '\n')
    }
    callback()
  }
}

pipeline(process.stdin, new LogTransform(), process.stdout, (err) => {
  if (err) {
    console.error('Pipeline failed.', err)
  }
})

// this typing is kinda fake
function formatLogEntry(
  severity: GCPLogLevel,
  endpoint: string | undefined,
  message: string,
  otherData: object
) {
  const severityLabel =
    severity === 'DEBUG'
      ? dim('[DEBUG]')
      : severity === 'INFO'
      ? blue('[INFO]')
      : severity === 'WARNING'
      ? yellow('[WARNING]')
      : severity === 'ERROR'
      ? red('[ERROR]')
      : severity

  const endpointLabel = endpoint ? dim(endpoint) + ' ' : ''
  const messageLabel = severity === 'ERROR' ? red(message) : message

  const data = omit(otherData, exlude)
  const dataSection = Object.entries(data).map(
    ([key, value]) => `\n  ${key}: ${JSON.stringify(value)}`
  )

  return `${severityLabel} ${endpointLabel}${messageLabel}${dataSection}`
}

const exlude = ['traceId']
