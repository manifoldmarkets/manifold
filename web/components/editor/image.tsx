import { Image } from '@tiptap/extension-image'
import clsx from 'clsx'
import { useState } from 'react'

export const BasicImage = Image.extend({
  renderReact: (attrs: any) => <img loading="lazy" {...attrs} />,
})

export const DisplayImage = Image.extend({
  renderReact: (attrs: any) => <ExpandingImage {...attrs} />,
})

function ExpandingImage(props: { src: string; alt?: string; title?: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <img
      loading="lazy"
      {...props}
      onClick={() => setExpanded((expanded) => !expanded)}
      className={clsx('cursor-pointer', !expanded && 'h-[128px]')}
      height={expanded ? undefined : 128}
    />
  )
}
