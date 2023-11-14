import { Lover } from 'common/love/lover'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Subtitle } from '../widgets/lover-subtitle'
import { EditableBio } from './editable-bio'
import { BioBlock } from './lover-bio-block'
import { Row } from 'web/components/layout/row'
import { PlusIcon } from '@heroicons/react/outline'

export function LoverBio(props: {
  isCurrentUser: boolean
  lover: Lover
  refreshLover: () => void
}) {
  const { isCurrentUser, lover, refreshLover } = props

  if (!lover.bio) {
    return isCurrentUser ? (
      <AddBioButton lover={lover} refreshLover={refreshLover} />
    ) : (
      <></>
    )
  }

  return (
    <Col>
      <Subtitle>Bio</Subtitle>
      <BioBlock
        isCurrentUser={isCurrentUser}
        lover={lover}
        refreshLover={refreshLover}
      />
    </Col>
  )
}

function AddBioButton(props: { lover: Lover; refreshLover: () => void }) {
  const { lover, refreshLover } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        color="gray-outline"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Row className="items-center gap-1">
          <PlusIcon className="h-4 w-4" />
          Add Bio
        </Row>
      </Button>
      <Modal open={open} setOpen={setOpen}>
        <Col className={MODAL_CLASS}>
          <EditableBio
            lover={lover}
            onCancel={() => setOpen(false)}
            onSave={() => {
              refreshLover()
              setOpen(false)
            }}
          />
        </Col>
      </Modal>
    </>
  )
}
