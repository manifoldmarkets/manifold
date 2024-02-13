import { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export function MultiUserList(props: {
  users: string[] | null
  modalLabel: string | ReactNode
}) {
  const { users, modalLabel } = props
  return (
    <Col className="bg-canvas-0 text-ink-1000 relative items-start gap-4 rounded-md p-6">
      <span className={'sticky top-0'}>{modalLabel}</span>
      {users == null ? (
        <LoadingIndicator />
      ) : users.length > 0 ? (
        <Col className="max-h-96 w-full gap-4 overflow-y-auto">
          {users.map((id) => (
            <Row key={id} className="w-full items-center gap-2">
              <Avatar userId={id} size={'sm'} />
              <UserLink userId={id} short />
            </Row>
          ))}
        </Col>
      ) : (
        <div>No one yet...</div>
      )}
    </Col>
  )
}
