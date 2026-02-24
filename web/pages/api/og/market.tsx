import { ImageResponse } from '@vercel/og'
import { ImageResponseOptions } from '@vercel/og/dist/types'
import { OgCardProps } from 'common/contract-seo'
import { NextRequest } from 'next/server'
import { OgMarket } from 'web/components/og/og-market'
import { classToTw } from 'web/components/og/utils'
// to add a font run `base64 -i font.ttf -o output.txt`
// then copy and paste it as a new entry in the fonts.json file
import { figtreeLight, figtreeMedium } from './fonts.json'

export const config = { runtime: 'edge' }
const UNSUPPORTED_OG_IMAGE_EXTENSIONS = ['.webp']

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

function getSafeOgAvatarUrl(avatarUrl?: string) {
  if (!avatarUrl) return undefined

  const maybeUrlWithoutQuery = avatarUrl.split('?')[0]
  if (
    UNSUPPORTED_OG_IMAGE_EXTENSIONS.some((ext) =>
      maybeUrlWithoutQuery.toLowerCase().endsWith(ext)
    )
  ) {
    return undefined
  }

  try {
    const { pathname } = new URL(avatarUrl)
    const decodedPathname = decodeURIComponent(pathname).toLowerCase()

    if (
      UNSUPPORTED_OG_IMAGE_EXTENSIONS.some((ext) =>
        decodedPathname.endsWith(ext)
      )
    ) {
      return undefined
    }
  } catch {
    // If URL parsing fails, keep the original string.
  }

  return avatarUrl
}

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const options = await getCardOptions()
    const ogMarketProps = Object.fromEntries(
      searchParams.entries()
    ) as OgCardProps
    const image = OgMarket({
      ...ogMarketProps,
      creatorAvatarUrl: getSafeOgAvatarUrl(ogMarketProps.creatorAvatarUrl),
    })

    return new ImageResponse(classToTw(image), options as ImageResponseOptions)
  } catch (e: any) {
    console.log(`${e.message}`)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}
