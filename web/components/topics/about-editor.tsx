import { PencilIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import { MAX_DESCRIPTION_LENGTH } from 'common/contract'
import { useEffect, useState } from 'react'
import { Button } from '../buttons/button'
import { JSONEmpty } from '../contract/contract-description'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Content, TextEditor, useTextEditor } from '../widgets/editor'

export const AboutEditor = (props: {
  initialContent?: JSONContent | string | undefined
  onSave: (content: JSONContent | string | undefined) => void
  editing: boolean
  setEditing: (editing: boolean) => void
  canEdit: boolean
}) => {
  const { initialContent, onSave, editing, setEditing, canEdit } = props
  const [content, setContent] = useState(initialContent)

  const isEmpty = !content || JSONEmpty(content)

  return (
    <>
      {editing ? (
        <AboutTextEditor initialContent={content} setContent={setContent} />
      ) : !isEmpty ? (
        <Col className="bg-canvas-0 rounded-2xl p-4">
          <Content content={content} size="lg" />
        </Col>
      ) : null}

      {canEdit &&
        (editing ? (
          <Row className="mt-4 justify-end gap-2">
            <Button
              onClick={() => {
                setEditing(false)
              }}
              color="red"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSave(content)
                setEditing(false)
              }}
            >
              Save
            </Button>
          </Row>
        ) : (
          <Button className="mt-4 gap-1" onClick={() => setEditing(true)}>
            <PencilIcon className="h-4 w-4" />
            {isEmpty ? 'Add' : 'Edit'} description
          </Button>
        ))}
    </>
  )
}

function AboutTextEditor(props: {
  initialContent: JSONContent | string | undefined
  setContent: (content: JSONContent) => void
}) {
  const { setContent, initialContent } = props

  const editor = useTextEditor({
    size: 'lg',
    max: MAX_DESCRIPTION_LENGTH,
    placeholder: `Background info, question inclusion criteria, moderation policy.\nBe thorough or don't write at all.`,
    defaultValue: initialContent,
    autofocus: true,
  })

  const editorContent = editor?.getJSON()
  useEffect(() => {
    if (editor && editorContent) setContent(editorContent)
  }, [editorContent])

  return <TextEditor editor={editor} className="border-none drop-shadow-md" />
}
