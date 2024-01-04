import { Lover } from 'common/love/lover'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Subtitle } from '../widgets/lover-subtitle'
import { BioBlock } from './lover-bio-block'

export function LoverBio(props: {
  isCurrentUser: boolean
  lover: Lover
  refreshLover: () => void
  fromLoverPage?: Lover
}) {
  const { isCurrentUser, lover, refreshLover, fromLoverPage} = props
  const [edit, setEdit] = useState(false)

  if (!isCurrentUser && !lover.bio) return null
  if (fromLoverPage && !lover.bio) return null

  return (
    <Col>
      <Subtitle className="mb-4">About Me</Subtitle>
      <BioBlock
        isCurrentUser={isCurrentUser}
        lover={lover}
        refreshLover={refreshLover}
        edit={edit || (isCurrentUser && !lover.bio)}
        setEdit={setEdit}
      />
    </Col>
  )
}
