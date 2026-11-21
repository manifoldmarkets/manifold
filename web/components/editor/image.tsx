import { Image } from '@tiptap/extension-image'
import { ExpandableImage } from 'web/components/widgets/expandable-image'

type ImageAttrs = { src: string; alt?: string; title?: string }

export const BasicImage = Image.extend({
  renderReact: (attrs: ImageAttrs) => (
    <img loading="lazy" {...attrs} alt={attrs.alt ?? ''} />
  ),
})

export const DisplayImage = Image.extend({
  renderReact: (attrs: ImageAttrs) => (
    <ExpandableImage
      {...attrs}
      height={128}
      className="h-[128px] object-contain"
    />
  ),
})

export const MediumDisplayImage = Image.extend({
  renderReact: (attrs: ImageAttrs) => (
    <ExpandableImage
      {...attrs}
      height={400}
      className="max-h-[400px] object-contain"
    />
  ),
})
