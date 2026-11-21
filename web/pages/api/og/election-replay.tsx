import { ImageResponse } from '@vercel/og'

type ImageResponseOptions = ConstructorParameters<typeof ImageResponse>[1]
import { NextRequest } from 'next/server'
import { OG_CARD_WIDTH } from 'common/edge/og'
import { OG_ELECTION_WIDTH } from 'web/components/og/og-election'
import {
  OgElectionReplay,
  OgElectionReplayProps,
} from 'web/components/og/og-election-replay'
import { classToTw } from 'web/components/og/utils'
import { getCardOptions } from './market'

export const config = { runtime: 'edge' }

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    // Laid out natively at 1200x630, like the election card.
    const options = await getCardOptions(OG_ELECTION_WIDTH / OG_CARD_WIDTH)
    const props = Object.fromEntries(
      searchParams.entries()
    ) as OgElectionReplayProps
    const image = OgElectionReplay(props)
    return new ImageResponse(classToTw(image), options as ImageResponseOptions)
  } catch (e) {
    console.log(e instanceof Error ? e.message : String(e))
    return new Response(`Failed to generate the image`, { status: 500 })
  }
}
