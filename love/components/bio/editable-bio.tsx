import { JSONContent } from '@tiptap/core'
import { Editor } from '@tiptap/react'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { Lover } from 'common/love/lover'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { updateLover } from 'web/lib/firebase/love/api'
import { track } from 'web/lib/service/analytics'

export function EditableBio(props: {
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
