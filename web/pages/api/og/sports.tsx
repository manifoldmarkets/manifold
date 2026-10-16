import { ImageResponse } from '@vercel/og'
import { parseSportsOgMarket } from 'common/sports-og'
import { NextRequest } from 'next/server'
import { OgSports } from 'web/components/og/og-sports'
import { classToTw } from 'web/components/og/utils'
import { loadSportsOgLogos } from 'web/lib/sports-og-logos'
import { getCardOptions } from './market'

type ImageResponseOptions = ConstructorParameters<typeof ImageResponse>[1]

export const config = { runtime: 'edge' }

export default async function handler(req: NextRequest) {
  try {
    const market = parseSportsOgMarket(
      new URL(req.url).searchParams.get('market')
    )
    const options = await getCardOptions(2)
    const logos = await loadSportsOgLogos(market)
    const render = (images: (string | undefined)[]) =>
      new ImageResponse(
        classToTw(OgSports({ market, logos: images })),
        options as ImageResponseOptions
      )
    if (!logos.some(Boolean)) return render([])
    try {
      // Decode before streaming: even a corrupt uploaded logo keeps a usable card.
      const response = render(logos)
      return new Response(await response.arrayBuffer(), {
        headers: response.headers,
      })
    } catch {
      return render([])
    }
  } catch (error) {
    console.error('Failed to generate sports preview', error)
    return new Response('Failed to generate the image', { status: 500 })
  }
}
