import { ImageResponse } from '@vercel/og'
import { ImageResponseOptions } from '@vercel/og/dist/types'
import { NextRequest } from 'next/server'
import { classToTw } from 'web/components/og/utils'
import { Gender, convertGender } from 'love/components/gender-icon'
import { LoveOgProps } from 'common/love/og-image'

export const config = { runtime: 'edge' }

export const getCardOptions = async () => {
  const [light, med] = await Promise.all([figtreeLightData, figtreeMediumData])

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

// Quick replacement for lodash.capitalize since this is an edge function
function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function OgLover(props: LoveOgProps) {
  const { avatarUrl, username, name, age, city, gender } = props
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center"
      style={{
        fontFamily: 'var(--font-main), Figtree',
        // Pink radial gradient
        background:
          'radial-gradient(circle at top left, #fdf2f8 0%, #fbcfe8 85%, #ec4899 100%)',
      }}
    >
      <div className="flex flex-col">
        <img src={avatarUrl} width={250} height={250} className="rounded-lg" />

        {/* Details */}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col rounded-lg px-4 pb-2 pt-6"
          // Equivalent to bg-gradient-to-t from-black/70 via-black/70 to-transparent
          style={{
            background:
              'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0) 100%)',
          }}
        >
          <div className="flex flex-row flex-wrap text-gray-50">
            <span className="break-words font-bold">{name}</span>, {age}
          </div>
          <div className="flex flex-row gap-1 text-xs text-gray-50">
            {city} • {capitalize(convertGender(gender as Gender))}
          </div>
        </div>
      </div>

      {/* Bottom: Logo + URL */}
      <div
        className="flex items-center pb-1"
        style={{ fontFamily: 'var(--font-main), Figtree-light' }}
      >
        <img
          className="mr-1.5 h-12 w-12 object-cover"
          src="https://manifold.love/manifold_love_logo.svg"
          width={48}
          height={48}
        />
        <span className="text-2xl font-thin">
          manifold
          <span className="mx-[1px]">.</span>
          <span className="font-semibold text-pink-700 dark:text-pink-300">
            love/{username}
          </span>
        </span>
      </div>
    </div>
  )
}

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const options = await getCardOptions()
    const loveOgProps = Object.fromEntries(
      searchParams.entries()
    ) as LoveOgProps
    const image = OgLover(loveOgProps)

    return new ImageResponse(classToTw(image), options as ImageResponseOptions)
  } catch (e: any) {
    console.log(`${e.message}`)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}
