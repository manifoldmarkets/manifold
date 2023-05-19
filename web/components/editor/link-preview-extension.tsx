import { mergeAttributes, Node } from '@tiptap/core'
import { LinkPreviewNodeView } from 'web/components/editor/link-preview-node-view'
import React from 'react'

interface LinkPreviewOptions {
  HTMLAttributes: Record<string, unknown>
}
export type LinkPreviewProps = {
  url: string
  title: string
  description: string
  image: string
  id: string
}
const name = 'linkPreview'
export const LinkPreviewExtension = Node.create<LinkPreviewOptions>({
  name,
  atom: true,

  group: 'block',

  addAttributes() {
    return {
      id: {
        default: null,
      },
      url: {
        default: null,
      },
      title: {
        default: null,
      },
      description: {
        default: null,
      },
      image: {
        default: null,
      },
      deleteCallback: {
        default: null,
      },
    }
  },

  renderReact(attrs: any) {
    return <LinkPreviewNodeView {...attrs} />
  },

  parseHTML() {
    return [
      {
        tag: name,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    console.log('HTMLAttributes', HTMLAttributes)
    return [name, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },
})
