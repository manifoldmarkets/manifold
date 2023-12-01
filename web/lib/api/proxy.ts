import { NextApiRequest, NextApiResponse } from 'next'
import { promisify } from 'util'
import { pipeline } from 'stream'
import { getApiUrl } from 'common/api'

function getProxiedRequestUrl(req: NextApiRequest, path: string) {
  const baseUrl = getApiUrl(path)
  const [prefix, qs] = req.url!.split('?', 2)
  if (qs) {
    return baseUrl + '?' + qs
  } else {
    return baseUrl
  }
}

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

export const fetchBackend = (req: NextApiRequest, path: string) => {
  const url = getProxiedRequestUrl(req, path)
  const headers = getProxiedRequestHeaders(req, [
    'Authorization',
    'Content-Type',
    'Origin',
  ])
  const hasBody = req.method != 'HEAD' && req.method != 'GET'
  const body = req.body
    ? JSON.stringify(req.body)
    : (req as unknown as ReadableStream)
  const opts = {
    headers,
    method: req.method,
    duplex: 'half',
    body: hasBody ? body : null,
  }
  return fetch(url, opts)
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
    return await promisify(pipeline)(
      backendRes.body as unknown as NodeJS.ReadableStream,
      res
    )
  }
}
