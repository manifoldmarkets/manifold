import { ImageResponse } from '@vercel/og'
import { OgSports } from 'web/components/og/og-sports'
import { classToTw } from 'web/components/og/utils'
import { getCardOptions } from './market'

type ImageResponseOptions = ConstructorParameters<typeof ImageResponse>[1]

export const config = { runtime: 'edge' }

export default async function handler() {
  try {
    const options = await getCardOptions(2)
    return new ImageResponse(
      classToTw(OgSports()),
      options as ImageResponseOptions
    )
  } catch (error) {
    console.error('Failed to generate sports preview', error)
    return new Response('Failed to generate the image', { status: 500 })
  }
}
