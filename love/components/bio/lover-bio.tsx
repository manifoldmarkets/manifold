import { Lover } from 'common/love/lover'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Subtitle } from '../widgets/lover-subtitle'
import { EditableBio } from './editable-bio'
import { BioBlock } from './lover-bio-block'
import { Row } from 'web/components/layout/row'
import { BiSolidBookHeart } from 'react-icons/bi'

export function LoverBio(props: {
  isCurrentUser: boolean
  lover: Lover
  refreshLover: () => void
}) {
  const { isCurrentUser, lover, refreshLover } = props
  const [edit, setEdit] = useState(false)

  if (!lover.bio && !edit) {
    if (isCurrentUser) {
      return (
        <Button
          color="gray-outline"
          onClick={() => {
            setEdit(true)
          }}
        >
          <Row className="items-center gap-1">
            <BiSolidBookHeart className="h-4 w-4" />
            Add Bio
          </Row>
        </Button>
      )
    }
    return null
  }

  return (
    <Col>
      <Subtitle>Bio</Subtitle>
      <BioBlock
        isCurrentUser={isCurrentUser}
        lover={lover}
        refreshLover={refreshLover}
        edit={edit}
        setEdit={setEdit}
      />
    </Col>
  )
}
