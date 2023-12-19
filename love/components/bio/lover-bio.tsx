import { Lover } from 'common/love/lover'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Subtitle } from '../widgets/lover-subtitle'
import { BioBlock } from './lover-bio-block'

export function LoverBio(props: {
  isCurrentUser: boolean
  lover: Lover
  refreshLover: () => void
}) {
  const { isCurrentUser, lover, refreshLover } = props
  const [edit, setEdit] = useState(false)

  return (
    <Col>
      <Subtitle className="mb-4">About Me</Subtitle>
      <BioBlock
        isCurrentUser={isCurrentUser}
        lover={lover}
        refreshLover={refreshLover}
        edit={edit || !lover.bio}
        setEdit={setEdit}
      />
    </Col>
  )
}
