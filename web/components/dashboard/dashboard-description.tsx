import { JSONContent } from '@tiptap/core'
import { JSONEmpty } from '../contract/contract-description'
import { Col } from '../layout/col'
import { Content } from '../widgets/editor'

export const DashboardDescription = (props: {
  description?: JSONContent
  inSidebar?: boolean
}) => {
  const { description } = props

  if (!description || JSONEmpty(description)) {
    return null
  }

  return (
    <Col className="bg-canvas-0 mb-4 rounded-2xl py-2 px-4 shadow-md xl:px-6 xl:py-4">
      <Content content={description} size="lg" />
    </Col>
  )
}
