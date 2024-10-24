import * as express from 'express'
import { ErrorRequestHandler, RequestHandler } from 'express'
import * as cors from 'cors'
import { hrtime } from 'node:process'
import { log, metrics } from 'shared/utils'
import { withMonitoringContext } from 'shared/monitoring/context'
import { APIError, pathWithPrefix } from 'common/api/utils'
import { API, type APIPath } from 'common/api/schema'
import { typedEndpoint } from './helpers/endpoint'
import { randomString } from 'common/util/random'
import { readHandlers } from './read-routes'

export const allowCorsUnrestricted: RequestHandler = cors({})

function cacheController(policy?: string): RequestHandler {
  return (_req, res, next) => {
    if (policy) res.appendHeader('Cache-Control', policy)
    next()
  }
}

const requestMonitoring: RequestHandler = (req, res, next) => {
  const traceContext = req.get('X-Cloud-Trace-Context')
  const traceId = traceContext ? traceContext.split('/')[0] : randomString(12)
  const { method, path: endpoint } = req
  const baseEndpoint = endpoint.split('/')[1] || endpoint
  const context = { endpoint, traceId, baseEndpoint }
  withMonitoringContext(context, () => {
    if (method == 'OPTIONS') {
      next()
      return
    }
    const startTs = hrtime.bigint()
    metrics.inc('http/request_count', { endpoint, baseEndpoint, method })
    res.on('close', () => {
      const endTs = hrtime.bigint()
      const latencyMs = Number(endTs - startTs) / 1e6
      metrics.push('http/request_latency', latencyMs, {
        endpoint,
        method,
        baseEndpoint,
      })
    })
    next()
  })
}

export const apiErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next
) => {
  if (error instanceof APIError) {
    log.info(error)
    if (!res.headersSent) {
      const output: { [k: string]: unknown } = { message: error.message }
      if (error.details != null) {
        output.details = error.details
      }
      res.status(error.code).json(output)
    }
  } else {
    log.error(error)
    if (!res.headersSent) {
      res.status(500).json({ message: error.stack, error })
    }
  }
}

export const readApp = express()
readApp.use(requestMonitoring)
readApp.options('*', allowCorsUnrestricted)

// Only mount GET endpoints
Object.entries(readHandlers).forEach(([path, handler]) => {
  const api = API[path as APIPath]
  if (api.method !== 'GET') return

  const cache = cacheController((api as any).cache)
  const url = '/' + pathWithPrefix(path as APIPath)

  const apiRoute = [
    url,
    express.json(),
    allowCorsUnrestricted,
    cache,
    typedEndpoint(path as any, handler as any),
    apiErrorHandler,
  ] as const

  readApp.get(...apiRoute)
})
