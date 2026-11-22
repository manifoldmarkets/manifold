import { ImageResponse } from '@vercel/og'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { parseSportsOgMarket } from 'common/sports-og'
import { NextRequest } from 'next/server'
import { loadSportsSharingScope } from 'web/lib/sports-og'
import { OgSports } from 'web/components/og/og-sports'
import { classToTw } from 'web/components/og/utils'
import { getCardOptions } from './market'

type ImageResponseOptions = ConstructorParameters<typeof ImageResponse>[1]

export const config = { runtime: 'edge' }

export default async function handler(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams
    const scope = await loadSportsSharingScope(params.get('sport'))
    const market = scope ? null : parseSportsOgMarket(params.get('market'))
    const options = await getCardOptions(2)
    return new ImageResponse(classToTw(OgSports({ market, scope })), {
      ...options,
      ...(isSportsBdlEnabled() &&
        params.has('sport') && {
          headers: { 'Cache-Control': 'no-store' },
        }),
    } as ImageResponseOptions)
  } catch (error) {
    console.error('Failed to generate sports preview', error)
    return new Response('Failed to generate the image', { status: 500 })
  }
}
