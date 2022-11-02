import { mergeAttributes, Node } from '@tiptap/core'
import React from 'react'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { StaticReactEmbed } from '../static-react-embed'

export default Node.create({
  name: 'staticReactEmbedComponent',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      embedName: '',
    }
  },

  parseHTML() {
    return [
      {
        tag: 'static-react-embed-component',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['static-react-embed-component', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(StaticReactEmbedComponent)
  },
})

function StaticReactEmbedComponent(props: any) {
  const embedName = props.node.attrs.embedName

  return (
    <NodeViewWrapper className="static-react-embed-component">
      <StaticReactEmbed embedName={embedName} />
    </NodeViewWrapper>
  )
}
