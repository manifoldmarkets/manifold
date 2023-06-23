import { ImageResponse, ImageResponseOptions } from '@vercel/og'
import { NextRequest } from 'next/server'
import { OgQuestion } from 'web/components/og/og-question'
import { classToTw } from 'web/components/og/utils'
import { OgCardProps } from 'common/contract-seo'

export const config = { runtime: 'edge' }
export const getCardOptions = async () => {
  const [readexPro, majorMono] = await Promise.all([
    READEX_PRO_DATA,
    MAJOR_MONO_DATA,
  ])
  return {
    width: 1200,
    height: 600,
    fonts: [
      {
        name: 'Readex Pro',
        data: readexPro,
        style: 'normal',
      },
      {
        name: 'Major Mono Display',
        data: majorMono,
        style: 'normal',
      },
    ],
  }
}

const READEX_PRO_URL = new URL('ReadexPro-Regular.ttf', import.meta.url)
const READEX_PRO_DATA = fetch(READEX_PRO_URL).then((res) => res.arrayBuffer())
const MAJOR_MONO_URL = new URL('MajorMonoDisplay-Regular.ttf', import.meta.url)
const MAJOR_MONO_DATA = fetch(MAJOR_MONO_URL).then((res) => res.arrayBuffer())

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const options = await getCardOptions()
    const OgQuestionProps = Object.fromEntries(
      searchParams.entries()
    ) as OgCardProps
    const image = OgQuestion(OgQuestionProps)

    return new ImageResponse(classToTw(image), options as ImageResponseOptions)
  } catch (e: any) {
    console.log(`${e.message}`)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}
