import { NextResponse, type NextRequest } from 'next/server'
import { fetchBackend, getHeaders } from './lib/api/proxy'

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname.replace('/api/', '')

  const backendRes = await fetchBackend(req, path)
  const backendData = await backendRes.json()

  const backendHeaders = await getHeaders(backendRes)
  const headers = new Headers(backendHeaders)
  headers.set('x-version', '13.1')

  return NextResponse.json(backendData, {
    headers,
    status: backendRes.status,
  })
}

export const config = {
  matcher: ['/api/v0/:path*'],
}
