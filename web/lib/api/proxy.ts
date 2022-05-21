import { NextApiRequest, NextApiResponse } from 'next'
import { FIREBASE_CONFIG } from 'common/envs/constants'
import { pipeline } from 'node:stream/promises'
import fetch, { Headers, Request, Response } from 'node-fetch'

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
  const proxyHeaders = getProxiedRequestHeaders(req, [
    'Authorization',
    'Content-Length',
    'Content-Type',
    'Origin',
  ])
  return fetch(
    new Request(url, {
      headers: proxyHeaders,
      method: req.method,
      body: req,
    })
  )
}

export const forwardResponse = async (
  res: NextApiResponse,
  backendRes: Response
) => {
  const headers = getProxiedResponseHeaders(backendRes, [
    'Access-Control-Allow-Origin',
    'Content-Length',
    'Content-Type',
    'Cache-Control',
    'ETag',
    'Vary',
  ])
  res.writeHead(backendRes.status, headers)
  if (backendRes.body != null) {
    return await pipeline(backendRes.body, res)
  }
}
