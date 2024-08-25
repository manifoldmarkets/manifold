import { ImageResponse } from '@vercel/og'
import { ImageResponseOptions } from '@vercel/og/dist/types'
import { NextRequest } from 'next/server'
import { OgMarket } from 'web/components/og/og-market'
import { classToTw } from 'web/components/og/utils'
import { getContractOGProps, OgCardProps } from 'common/contract-seo'

export const config = { runtime: 'edge' }
export const getCardOptions = async (): Promise<ImageResponseOptions> => {
  const [light, med] = await Promise.all([figtreeLightData, figtreeMediumData])

  // https://vercel.com/docs/functions/og-image-generation/og-image-api
  return {
    width: 600,
    height: 315,
    fonts: [
      {
        name: 'Figtree',
        data: med,
        style: 'normal',
      },
      {
        name: 'Figtree-light',
        data: light,
        style: 'normal',
      },
    ],
    headers: {
      // max-age is in seconds. Vercel defaults to a very large value, but
      // we want to show fresh data, so we override here.
      'cache-control': 'public, no-transform, max-age=30',
    },
  }
}

const FIGTREE_LIGHT_URL = new URL('Figtree-Light.ttf', import.meta.url)
const figtreeLightData = fetch(FIGTREE_LIGHT_URL).then((res) =>
  res.arrayBuffer()
)
const FIGTREE_MED_URL = new URL('Figtree-Medium.ttf', import.meta.url)
const figtreeMediumData = fetch(FIGTREE_MED_URL).then((res) =>
  res.arrayBuffer()
)

async function getFreshOgMarketProps(
  contractId: string | undefined,
  origin: string
): Promise<OgCardProps | undefined> {
  if (contractId) {
    try {
      const resp = await fetch(`${origin}/api/v0/market/${contractId}`)
      const contract = resp.ok && (await resp.json())

      if (contract) {
        return getContractOGProps(contract)
      }
    } catch (e) {
      console.log(
        `Failed to fetch contract ${contractId} when rendering OG image`,
        e
      )
    }
  }
  return undefined
}

export default async function handler(req: NextRequest) {
  try {
    const { searchParams, origin } = new URL(req.url)
    const options = await getCardOptions()
    const ogMarketPropsFromParams = Object.fromEntries(
      searchParams.entries()
    ) as OgCardProps
    const { contractId } = ogMarketPropsFromParams

    const ogMarketPropsFromDb = await getFreshOgMarketProps(contractId, origin)

    const image = OgMarket(ogMarketPropsFromDb ?? ogMarketPropsFromParams)

    return new ImageResponse(classToTw(image), options)
  } catch (e: any) {
    console.log(`${e.message}`)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}
