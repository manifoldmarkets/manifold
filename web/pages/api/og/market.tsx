import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'
import React from 'react'

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

    const image = buildImage({ question })
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
  // Base case:
  if (typeof element === 'string' || !element.props) {
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

const buildImage = (props: { question: string }) => (
  <div className="flex h-full w-full flex-col items-center justify-center bg-white px-24">
    {/* <!-- Profile image --> */}
    <div className="absolute left-24 top-8 flex">
      <div className="flex flex-row">
        <img
          className="mr-6 flex h-24 w-24 items-center justify-center rounded-full bg-white"
          src="https://avatars.githubusercontent.com/u/1062408?v=4"
          alt=""
        />
        <div className="flex flex-col">
          <p className="mb-2 text-3xl text-gray-900">Austin</p>
          <p className="text-3xl text-gray-500">@Austin</p>
        </div>
      </div>
    </div>

    {/* <!-- Manifold logo --> */}
    <div className="absolute right-24 top-8 flex">
      <a className="flex flex-row" href="/">
        <img
          className="mr-3 sm:h-12 sm:w-12"
          src="https:&#x2F;&#x2F;manifold.markets&#x2F;logo.png"
          width="40"
          height="40"
        />
        <div
          className="mt-1 hidden lowercase sm:flex sm:text-3xl"
          style={{ fontFamily: 'Major Mono Display' }}
        >
          Manifold Markets
        </div>
      </a>
    </div>

    <div className="flex flex-row justify-between">
      <div className="line-clamp-4 mr-12 flex text-6xl leading-tight text-indigo-700">
        {props.question}
      </div>
      <div className="flex flex-col text-center text-teal-500">
        <div className="flex text-8xl">68%</div>
        <div className="flex text-4xl">chance</div>
      </div>
    </div>

    {/* <!-- Metadata --> */}
    <div className="absolute bottom-16 flex">
      <div className="line-clamp-2 flex max-w-[80vw] text-3xl text-gray-500">
        #one * two * #threez
      </div>
    </div>
  </div>
)
