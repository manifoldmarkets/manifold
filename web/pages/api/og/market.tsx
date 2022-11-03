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
// TODO: Rename this file to 'contract.tsx'?

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
    const creatorName = searchParams.get('creatorName') ?? ''
    const creatorAvatarUrl = searchParams.get('creatorAvatarUrl') ?? ''
    const creatorUsername = searchParams.get('creatorUsername') ?? ''
    const metadata = searchParams.get('metadata') ?? ''
    const probability = searchParams.get('probability') ?? ''

    const image = buildImage({
      question,
      creatorName,
      creatorAvatarUrl,
      creatorUsername,
      metadata,
      probability,
    })
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
// Notes for working with this:
// - Some css elements are missing or broken (e.g. 'gap')
// - Every element should have `flex` set
function buildImage(props: {
  question: string
  creatorName?: string
  creatorAvatarUrl?: string
  creatorUsername?: string
  metadata?: string
  probability?: string
}) {
  return (
    <div className="flex h-full w-full flex-col bg-white px-24">
      {/* <!-- Profile image --> */}
      <div className="absolute left-24 top-8 flex flex-row ">
        <img
          className="mr-6 flex h-24 w-24 items-center justify-center rounded-full bg-white"
          // Fill in with a placeholder image if missing
          src={props.creatorAvatarUrl ?? 'https://via.placeholder.com/150.png'}
          alt=""
        />
        <div className="mt-3 flex flex-col">
          <div className="flex text-3xl text-gray-900">{props.creatorName}</div>
          <div className="flex text-3xl text-gray-500">
            @{props.creatorUsername}
          </div>
        </div>
      </div>

      {/* <!-- Manifold logo --> */}
      <div className="absolute right-24 top-8 flex">
        <a className="flex flex-row" href="/">
          <img
            className="mr-3 h-12 w-12"
            src="https:&#x2F;&#x2F;manifold.markets&#x2F;logo.svg"
            width="40"
            height="40"
          />
          <div
            className="mt-3 flex text-3xl lowercase"
            style={{ fontFamily: 'Major Mono Display' }}
          >
            Manifold Markets
          </div>
        </a>
      </div>

      <div className="flex max-h-40 w-full flex-row justify-between pt-36">
        <div className="line-clamp-4 mr-12 flex text-6xl leading-tight text-indigo-700">
          {props.question}
        </div>
        <div className="flex flex-col text-teal-500">
          <div className="flex text-8xl">{props.probability}</div>
          <div className="flex text-4xl">chance</div>
        </div>
      </div>

      {/* <!-- Metadata --> */}
      <div className="absolute bottom-16 left-24 flex">
        <div className="line-clamp-2 flex max-w-[80vw] bg-white text-3xl text-gray-500">
          {props.metadata}
        </div>
      </div>
    </div>
  )
}
