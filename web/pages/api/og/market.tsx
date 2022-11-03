import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'

export const config = {
  runtime: 'experimental-edge',
}

async function loadFont(url: URL) {
  const res = await fetch(url)
  return await res.arrayBuffer()
}

// Note: These URLs must be constructed outside of a function, due to
// the weird way import.meta.url works
const readexFontUrl = new URL('ReadexPro-Regular.ttf', import.meta.url)
const monoFontUrl = new URL('MajorMonoDisplay-Regular.ttf', import.meta.url)

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    // ?question=<question>
    const question =
      searchParams.get('question')?.slice(0, 100) ?? 'My default question?'

    return new ImageResponse(body({ question }), {
      width: 1200,
      height: 600,
      fonts: [
        {
          name: 'Readex Pro',
          data: await loadFont(readexFontUrl),
          style: 'normal',
        },
        {
          name: 'Major Mono Display',
          data: await loadFont(monoFontUrl),
          style: 'normal',
        },
      ],
    })
  } catch (e: any) {
    console.log(`${e.message}`)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}

// TODO: Figure out how to allow the `tw` prop

const body = ({ question }) => (
  <div
    tw="px-24"
    style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'white',
    }}
  >
    {/* <!-- Profile image --> */}
    <div tw="flex absolute left-24 top-8">
      <div tw="flex flex-row">
        <img
          tw="h-24 w-24 rounded-full bg-white flex items-center justify-center mr-6"
          src="https://avatars.githubusercontent.com/u/1062408?v=4"
          alt=""
        />
        <div tw="flex flex-col">
          <p tw="text-gray-900 text-3xl mb-2">Austin</p>
          <p tw="text-gray-500 text-3xl">@Austin</p>
        </div>
      </div>
    </div>

    {/* <!-- Manifold logo --> */}
    <div tw="flex absolute right-24 top-8">
      <a tw="flex flex-row" href="/">
        <img
          tw="sm:h-12 sm:w-12 mr-3"
          src="https:&#x2F;&#x2F;manifold.markets&#x2F;logo.png"
          width="40"
          height="40"
        />
        <div
          tw="hidden sm:flex lowercase mt-1 sm:text-3xl"
          style={{ fontFamily: 'Major Mono Display' }}
        >
          Manifold Markets
        </div>
      </a>
    </div>

    <div tw="flex flex-row justify-between">
      <div tw="flex text-indigo-700 text-6xl leading-tight line-clamp-4 mr-12">
        {question}
      </div>
      <div tw="flex flex-col text-center text-teal-500">
        <div tw="text-8xl">68%</div>
        <div tw="text-4xl">chance</div>
      </div>
    </div>

    {/* <!-- Metadata --> */}
    <div tw="flex absolute bottom-16">
      <div tw="flex text-gray-500 text-3xl max-w-[80vw] line-clamp-2">
        #one * two * #threez
      </div>
    </div>
  </div>
)
