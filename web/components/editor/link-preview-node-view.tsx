// LinkPreviewNodeView.tsx
import { NodeViewRenderer, NodeViewRendererProps } from '@tiptap/react'
import { Col } from 'web/components/layout/col'

const LinkPreviewNodeView: NodeViewRenderer = (
  props: NodeViewRendererProps
) => {
  const { node } = props

  return (
    <Col className="link-preview w-full" {...props}>
      asdasdniasudnaisud
      {node.attrs.image && (
        <img src={node.attrs.image} alt={node.attrs.title} />
      )}
      <div className="content">
        <div className="title">{node.attrs.title}</div>
        <div className="description">{node.attrs.description}</div>
      </div>
    </Col>
  )
}

export default LinkPreviewNodeView
