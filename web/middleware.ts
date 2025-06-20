import { NextResponse, type NextRequest } from 'next/server'
import { PROD_CONFIG } from 'common/envs/prod'

export async function middleware(req: NextRequest) {
  const url = req.nextUrl

  // Handle play parameter removal for all requests
  if (url.searchParams.has('play')) {
    url.searchParams.delete('play')
    return NextResponse.redirect(url, 308)
  }

  // Only run API proxy logic for API requests
  if (url.pathname.startsWith('/api/')) {
    const path = req.nextUrl.pathname.replace('/api/', '')

    if (pathsToSkip.includes(path)) {
      return NextResponse.next()
    }

    return new Response('Permanent Redirect', {
      status: 308,
      headers: {
        location: getProxiedRequestUrl(req, path),
      },
    })
  }

  // For non-API requests, just continue normally
  return NextResponse.next()
}

export const config = {
  matcher: [
    // API proxy
    '/api/v0/:path*',
    // Contract pages - be specific about the format
    // This matches /username/contract-slug but not / or /browse etc
    '/([^/]+)/([^/]+)',
    // Embed pages
    '/embed/([^/]+)/([^/]+)',
  ],
}

const pathsToSkip = ['v0/deployment-id', 'v0/revalidate']

function getProxiedRequestUrl(req: NextRequest, path: string) {
  const baseUrl = getApiUrl(path)
  const [_prefix, qs] = req.url!.split('?', 2)
  if (qs) {
    return baseUrl + '?' + qs
  } else {
    return baseUrl
  }
}

// copied from common/src/utils/api. TODO the right thing
function getApiUrl(path: string) {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `http://${process.env.NEXT_PUBLIC_API_URL}/${path}`
  } else {
    const { apiEndpoint } = PROD_CONFIG
    return `https://${apiEndpoint}/${path}`
  }
}
