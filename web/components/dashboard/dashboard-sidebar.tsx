import { JSONContent } from '@tiptap/core'
import { JSONEmpty } from '../contract/contract-description'
import { Col } from '../layout/col'
import { Content } from '../widgets/editor'
import clsx from 'clsx'

export const DashboardSidebar = (props: {
  description?: JSONContent
  inSidebar?: boolean
}) => {
  const { description, inSidebar } = props

  const noDescription = !description || JSONEmpty(description)
  if (noDescription) {
    return <></>
  }

  return (
    <Col className={clsx(inSidebar ? 'hidden xl:inline-flex' : 'xl:hidden')}>
      {inSidebar && (
        <Col className="text-primary-700 mb-2 hidden xl:inline-flex">
          Additional Context
        </Col>
      )}
      <Col className="bg-canvas-0 mb-4 gap-2 py-2 px-4 xl:px-6 xl:py-4">
        <Content content={description} />
      </Col>
    </Col>
  )
}
