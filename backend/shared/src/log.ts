import { format } from 'node:util'

// mapping JS log levels (e.g. functions on console object) to GCP log levels
export const JS_TO_GCP_LEVELS = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
} as const

const JS_LEVELS = Object.keys(JS_TO_GCP_LEVELS) as LogLevel[]

export type LogLevel = keyof typeof JS_TO_GCP_LEVELS
export type LogDetails = Record<string, unknown>
export type TextLogger = (msg: unknown, ...args: unknown[]) => void
export type StructuredLogger = (msg: unknown, props?: LogDetails) => void
export type Logger = TextLogger & {
  [Property in LogLevel]: StructuredLogger
}

const IS_GCP = process.env.GOOGLE_CLOUD_PROJECT != null

function toString(obj: unknown) {
  if (obj instanceof Error) {
    return obj.stack // is formatted like "Error: message\n[stack]"
  }
  return String(obj)
}

function replacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') {
    return value.toString()
  } else if (value instanceof Error) {
    return {
      // custom enumerable properties on error, like e.g. status code on APIErrors
      ...value,
      // these properties aren't enumerable so we need to include them explicitly
      // see https://stackoverflow.com/questions/18391212/
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  } else {
    return value
  }
}

function ts() {
  return new Date().toISOString()
}

// handles both the cases where someone wants to write unstructured
// stream-of-consciousness console logging like log('count:', 1, 'user': u)
// and also structured key/value logging with severity
function writeLog(
  msg: unknown,
  opts?: { level?: LogLevel; props?: LogDetails; rest?: unknown[] }
) {
  const { level, props, rest } = opts ?? {}
  try {
    const message = format(toString(msg), ...(rest ?? []))
    if (IS_GCP) {
      const output = { message } as Record<string, unknown>
      if (level) {
        output.severity = JS_TO_GCP_LEVELS[level]
      }
      if (props) {
        Object.assign(output, props ?? {})
      }
      console.log(JSON.stringify(output, replacer))
    } else {
      const fn = console[level ?? 'log']
      if (props != null) {
        fn(`[${ts()}] ${message}`, JSON.stringify(props, replacer))
      } else {
        fn(`[${ts()}] ${message}`)
      }
    }
  } catch (e) {
    console.error('Could not write log output.', e)
  }
}

// if ctx is provided, records it as structured data along with every log entry
export function getLogger(ctx?: LogDetails): Logger {
  const logger = ((msg: unknown, ...args: unknown[]) => {
    writeLog(msg, { props: ctx, rest: args })
  }) as Logger
  for (const level of JS_LEVELS) {
    logger[level] = (msg: unknown, props?: LogDetails) =>
      writeLog(msg, { level, props: { ...(ctx ?? {}), ...props } })
  }
  return logger
}

export const log = getLogger()
