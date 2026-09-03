import { PROD_CONFIG } from 'common/envs/prod'
import { getInstanceSubdomainFromHostname } from 'common/util/instance-subdomain'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(req: NextRequest) {
  const url = req.nextUrl
  const instanceSubdomain = getInstanceSubdomainFromHostname(
    req.headers.get('host') ?? ''
  )

  // Handle play parameter removal for all requests
  if (url.searchParams.has('play')) {
    const playValue = url.searchParams.get('play')
    url.searchParams.delete('play')

    if (playValue === 'false') {
      // Redirect to path with --cash suffix and no query parameters
      const newUrl = new URL(url.pathname + '--cash', url.origin)
      return NextResponse.redirect(newUrl, 308)
    } else {
      return NextResponse.redirect(url, 308)
    }
  }

  // Only run API proxy logic for API requests
  if (url.pathname.startsWith('/api/')) {
    const path = req.nextUrl.pathname.replace('/api/', '')

    if (pathsToSkip.includes(path)) {
      return NextResponse.next()
    }

    // This is a 308 redirect (the browser makes a fresh request to the API
    // host), so custom headers set here wouldn't survive — pass the
    // instance along as a query param instead; the backend's tenant-context
    // middleware checks both.
    return new Response('Permanent Redirect', {
      status: 308,
      headers: {
        location: getProxiedRequestUrl(req, path, instanceSubdomain),
      },
    })
  }

  // For everything else, forward which private instance (if any) this
  // request is for, based on the subdomain, so getServerSideProps and other
  // server-side code can read it off the request headers.
  if (instanceSubdomain) {
    const headers = new Headers(req.headers)
    headers.set('x-manifold-instance', instanceSubdomain)
    return NextResponse.next({ request: { headers } })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Everything except static assets and Next internals.
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
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

function getProxiedRequestUrl(
  req: NextRequest,
  path: string,
  instanceSubdomain: string | null
) {
  const baseUrl = getApiUrl(path)
  const [_prefix, qs] = req.url!.split('?', 2)
  const params = new URLSearchParams(qs)
  if (instanceSubdomain) params.set('instance', instanceSubdomain)
  const query = params.toString()
  return query ? baseUrl + '?' + query : baseUrl
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
