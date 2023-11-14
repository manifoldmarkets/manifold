import { Lover } from 'common/love/lover'
import { Subtitle } from '../widgets/lover-subtitle'
import { Col } from 'web/components/layout/col'
import {
  Content,
  TextEditor,
  useTextEditor,
} from 'web/components/widgets/editor'
import { JSONContent } from '@tiptap/core'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { Row } from 'web/components/layout/row'
import { updateLover } from 'web/lib/firebase/love/api'
import { track } from 'web/lib/service/analytics'
import { EditableBio } from './editable-bio'
import { BioBlock } from './lover-bio-block'

export function LoverBio(props: {
  isCurrentUser: boolean
  lover: Lover
  refreshLover: () => void
}) {
  const { isCurrentUser, lover, refreshLover } = props

  return (
    <Col>
      <Subtitle>Bio</Subtitle>
      {lover.bio ? (
        <BioBlock
          isCurrentUser={isCurrentUser}
          lover={lover}
          refreshLover={refreshLover}
        />
      ) : (
        isCurrentUser && (
          <AddBioButton lover={lover} refreshLover={refreshLover} />
        )
      )}
    </Col>
  )
}

function AddBioButton(props: { lover: Lover; refreshLover: () => void }) {
  const { lover, refreshLover } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        className="indigo-outline"
        onClick={() => {
          setOpen(true)
        }}
      >
        Add Bio
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
