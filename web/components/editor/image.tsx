import { Image } from '@tiptap/extension-image'
import clsx from 'clsx'
import { useState } from 'react'

export const BasicImage = Image.extend({
  renderReact: (attrs: any) => <img loading="lazy" {...attrs} />,
})

export const DisplayImage = Image.extend({
  renderReact: (attrs: any) => <ExpandingImage {...attrs} />,
})

export const MediumDisplayImage = Image.extend({
  renderReact: (attrs: any) => <ExpandingImage size={'md'} {...attrs} />,
})

function ExpandingImage(props: {
  src: string
  alt?: string
  title?: string
  size?: 'md'
}) {
  const [expanded, setExpanded] = useState(false)
  const { size, ...rest } = props
  const height = size === 'md' ? 400 : 128
  return (
    <img
      loading="lazy"
      {...rest}
      onClick={() => setExpanded((expanded) => !expanded)}
      className={clsx(
        'cursor-pointer object-contain',
        expanded ? 'min-h-[128px]' : size === 'md' ? 'h-[400px]' : 'h-[128px]'
      )}
      height={expanded ? undefined : height}
    />
  )
}
