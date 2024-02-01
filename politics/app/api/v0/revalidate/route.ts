import { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { revalidatePath } from 'next/cache'

export async function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get('tag')
  if (tag) {
    revalidateTag(tag)
    return Response.json({ revalidated: true, now: Date.now() })
  }
  const path = request.nextUrl.searchParams.get('path')

  if (path) {
    revalidatePath(path)
    return Response.json({ revalidated: true, now: Date.now() })
  }

  return Response.json({
    revalidated: false,
    now: Date.now(),
    message: 'Missing path or tag to revalidate',
  })
}
