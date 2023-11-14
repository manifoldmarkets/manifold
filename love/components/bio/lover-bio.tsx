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
        <Content content={lover.bio as JSONContent} />
      ) : (
        isCurrentUser && (
          <AddBioButton lover={lover} refreshLover={refreshLover} />
        )
      )}
    </Col>
  )
}

function AddBioButton(props: { lover: Lover; refreshLover: () => void }) {
  const { lover } = props
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
            onSave={() => setOpen(false)}
          />
        </Col>
      </Modal>
    </>
  )
}

function EditableBio(props: {
  lover: Lover
  onCancel: () => void
  onSave: () => void
}) {
  const { lover, onCancel, onSave } = props
  const editor = useTextEditor({
    max: MAX_DESCRIPTION_LENGTH,
    defaultValue: (lover.bio as JSONContent) ?? '',
    placeholder: 'Tell us about yourself!',
  })

  const saveBio = async () => {
    if (!editor) return
    const res = await updateLover({
      ...lover,
      bio: editor.getJSON(),
    }).catch((e) => {
      console.error(e)
      return false
    })
    if (res) {
      console.log('success')
      track('edited lover bio')
    }
  }
  return (
    <Col className="w-full">
      <TextEditor editor={editor} />
      <Row className="my-2 justify-between gap-2">
        <Button color="gray-outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            await saveBio()
            onSave()
          }}
        >
          Save
        </Button>
      </Row>
    </Col>
  )
}
