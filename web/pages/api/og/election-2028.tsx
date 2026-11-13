import { ImageResponse } from '@vercel/og'

type ImageResponseOptions = ConstructorParameters<typeof ImageResponse>[1]
import { NextRequest } from 'next/server'
import { OG_CARD_WIDTH } from 'common/edge/og'
import {
  OgElection2028,
  OgElection2028Props,
  OG_ELECTION_2028_WIDTH,
} from 'web/components/og/og-election-2028'
import { classToTw } from 'web/components/og/utils'
import { getCardOptions } from './market'

export const config = { runtime: 'edge' }

export default async function handler(req: NextRequest) {
  try {
    const url = new URL(req.url)
    // Laid out natively at 1200x630 (2x the base card), not scaled up.
    const options = await getCardOptions(OG_ELECTION_2028_WIDTH / OG_CARD_WIDTH)
    const props = Object.fromEntries(
      url.searchParams.entries()
    ) as OgElection2028Props
    // Candidate photos are this deployment's static files; the origin comes
    // from the request, never the query string.
    const image = OgElection2028({ ...props, origin: url.origin })
    return new ImageResponse(classToTw(image), options as ImageResponseOptions)
  } catch (e) {
    console.log(e instanceof Error ? e.message : String(e))
    return new Response(`Failed to generate the image`, { status: 500 })
  }
}
