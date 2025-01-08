import { ImageResponse } from '@vercel/og'
import { type ImageResponseOptions } from '@vercel/og/dist/types'
import { NextRequest } from 'next/server'
import { OgTopic, OgTopicProps } from 'web/components/og/og-topic'
import { classToTw } from 'web/components/og/utils'
import { getCardOptions } from './market'

export const config = { runtime: 'edge' }
export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const options = await getCardOptions()
    const ogTopicProps = Object.fromEntries(
      searchParams.entries()
    ) as OgTopicProps
    const image = OgTopic(ogTopicProps)

    return new ImageResponse(classToTw(image), options as ImageResponseOptions)
  } catch (e: any) {
    console.log(`${e.message}`)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}
