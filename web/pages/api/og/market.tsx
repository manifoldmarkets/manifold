import { ImageResponse, ImageResponseOptions } from '@vercel/og'
import { NextRequest } from 'next/server'
import React from 'react'
import { OgMarket } from 'web/components/og/og-market'
import { OgCardProps } from 'common/contract-details'

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
    const OgMarketProps = Object.fromEntries(
      searchParams.entries()
    ) as OgCardProps
    const image = OgMarket(OgMarketProps)

    return new ImageResponse(replaceTw(image), options as ImageResponseOptions)
  } catch (e: any) {
    console.log(`${e.message}`)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}

export function replaceTw(element: JSX.Element | string): JSX.Element {
  // Base case
  if (typeof element === 'string' || !element?.props) {
    return element as JSX.Element
  }

  // Replace `className` with `tw` for this element
  const { props } = element
  const newProps = { ...props }
  if (props.className) {
    newProps.tw = props.className
    delete newProps.className
  }

  // Recursively replace children, whether we have many, one, or no children
  const { children } = props
  const newChildren: (JSX.Element | string)[] = children
    ? Array.isArray(children)
      ? children.map(replaceTw)
      : [replaceTw(children)]
    : []

  return React.createElement(element.type, newProps, newChildren)
}
