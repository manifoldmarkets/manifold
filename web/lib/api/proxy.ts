import { getApiUrl } from 'common/api/utils'
import { NextRequest } from 'next/server'

function getProxiedRequestUrl(req: NextRequest, path: string) {
  const baseUrl = getApiUrl(path)
  const [_prefix, qs] = req.url!.split('?', 2)
  if (qs) {
    return baseUrl + '?' + qs
  } else {
    return baseUrl
  }
}

function getProxiedRequestHeaders(req: NextRequest, whitelist: string[]) {
  const result = new Headers()
  for (const name of whitelist) {
    const v = req.headers.get(name.toLowerCase())
    if (Array.isArray(v)) {
      for (const vv of v) {
        result.append(name, vv)
      }
    } else if (v != null) {
      result.append(name, v)
    }
  }
  // mqp: the backend uses this in the cloud armor rules to bypass GCP throttling
  result.append('X-Vercel-Proxy-Secret', process.env.VERCEL_PROXY_SECRET ?? '')
  result.append('X-Forwarded-For', '')
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

export const fetchBackend = (req: NextRequest, path: string) => {
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

export const getHeaders = async (backendRes: Response) => {
  return getProxiedResponseHeaders(backendRes, [
    'Access-Control-Allow-Origin',
    'Content-Type',
    'Cache-Control',
    'ETag',
    'Vary',
  ])
}
