import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'
import React from 'react'
import { OgMarket } from 'web/pages/og/og-market'
import { OgCardProps } from 'common/contract-details'

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
    const OgMarketProps = Object.fromEntries(
      searchParams.entries()
    ) as OgCardProps
    const image = OgMarket(OgMarketProps)

    return new ImageResponse(replaceTw(image), {
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

function replaceTw(element: JSX.Element | string): JSX.Element {
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
