import { ImageResponse } from '@vercel/og'
import { ImageResponseOptions } from '@vercel/og/dist/types'
import { NextRequest } from 'next/server'
import { OgMarket } from 'web/components/og/og-market'
import { classToTw } from 'web/components/og/utils'
import { OgCardProps } from 'common/contract-seo'
// to add a font run `base64 -i font.ttf -o output.txt`
// then copy and paste it as a new entry in the fonts.json file
import { figtreeLight, figtreeMedium } from './fonts.json'

export const config = { runtime: 'edge' }
export const getCardOptions = async () => {
  return {
    width: 600,
    height: 315,
    fonts: [
      {
        name: 'Figtree',
        data: FIGTREE_MED,
        style: 'normal',
      },
      {
        name: 'Figtree-light',
        data: FIGTREE_LIGHT,
        style: 'normal',
      },
    ],
  }
}

const FIGTREE_LIGHT = Buffer.from(figtreeLight, 'base64')
const FIGTREE_MED = Buffer.from(figtreeMedium, 'base64')

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const options = await getCardOptions()
    const OgMarketProps = Object.fromEntries(
      searchParams.entries()
    ) as OgCardProps
    const image = OgMarket(OgMarketProps)

    return new ImageResponse(classToTw(image), options as ImageResponseOptions)
  } catch (e: any) {
    console.log(`${e.message}`)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}
