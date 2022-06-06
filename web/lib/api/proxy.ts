import { NextApiRequest, NextApiResponse } from 'next'
import { promisify } from 'util'
import { pipeline } from 'stream'
import { getFunctionUrl } from 'web/lib/firebase/api-call'
import { V2CloudFunction } from 'common/envs/prod'
import fetch, { Headers, Response } from 'node-fetch'

function getProxiedRequestHeaders(req: NextApiRequest, whitelist: string[]) {
  const result = new Headers()
  for (const name of whitelist) {
    const v = req.headers[name.toLowerCase()]
    if (Array.isArray(v)) {
      for (const vv of v) {
        result.append(name, vv)
      }
    } else if (v != null) {
      result.append(name, v)
    }
  }
  result.append('X-Forwarded-For', req.socket.remoteAddress || '')
  result.append('Via', 'Vercel public API')
  return result
}

function getProxiedResponseHeaders(res: Response, whitelist: string[]) {
  const result: { [k: string]: string } = {}
  for (const name of whitelist) {
    const v = res.headers.get(name)
    if (v != null) {
      result[name] = v
    }
  }
  return result
}

export const fetchBackend = (req: NextApiRequest, name: V2CloudFunction) => {
  const url = getFunctionUrl(name)
  const headers = getProxiedRequestHeaders(req, [
    'Authorization',
    'Content-Length',
    'Content-Type',
    'Origin',
  ])
  return fetch(url, { headers, method: req.method, body: req })
}

export const forwardResponse = async (
  res: NextApiResponse,
  backendRes: Response
) => {
  const headers = getProxiedResponseHeaders(backendRes, [
    'Access-Control-Allow-Origin',
    'Content-Type',
    'Cache-Control',
    'ETag',
    'Vary',
  ])
  res.writeHead(backendRes.status, headers)
  if (backendRes.body != null) {
    return await promisify(pipeline)(backendRes.body, res)
  }
}
