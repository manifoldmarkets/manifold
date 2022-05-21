import { NextApiRequest, NextApiResponse } from 'next'
import { FIREBASE_CONFIG } from 'common/envs/constants'
import { promisify } from 'util'
import { pipeline } from 'stream'
import fetch, { Headers, Response } from 'node-fetch'

function getProxiedRequestHeaders(req: NextApiRequest, whitelist: string[]) {
  const result = new Headers()
  for (let name of whitelist) {
    const v = req.headers[name.toLowerCase()]
    if (Array.isArray(v)) {
      for (let vv of v) {
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
  for (let name of whitelist) {
    const v = res.headers.get(name)
    if (v != null) {
      result[name] = v
    }
  }
  return result
}

export const fetchBackend = (req: NextApiRequest, endpoint: string) => {
  const { projectId, region } = FIREBASE_CONFIG
  const url = `https://${region}-${projectId}.cloudfunctions.net/${endpoint}`
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
